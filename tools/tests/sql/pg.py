"""Shared helpers for the SQL tests: a fresh database with a stub of the Supabase platform (auth.users + auth.uid(),
storage.*, roles anon/authenticated/service_role, pgcrypto in `extensions`), then supabase/schema.sql (and
optionally supabase/assistant.sql) from the repo. psql runs against the private cluster from setup_pg.sh.

    from pg import Db
    db = Db('secdb', assistant=True)      # fresh database, schema loaded (re-run twice to prove idempotence)
    db.sql("select 1")                    # as postgres (superuser)
    db.as_(UID, "select public.x()")      # as an authenticated user (auth.uid() = UID); as_(None, …) = anon
    db.check(label, output, want)         # want: substring, or a predicate on the output
"""
import os, sys, json, hmac, hashlib, subprocess, time, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.environ.get('CR_REPO') or os.path.join(HERE, '..', '..', '..'))
SOCK = os.environ.get('CR_PG') or '/var/tmp/chordroom-pg'
PORT = '5499'
SCHEMA = os.path.join(REPO, 'supabase', 'schema.sql')
ASSISTANT = os.path.join(REPO, 'supabase', 'assistant.sql')

STUB = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}',
  created_at timestamptz not null default now(), email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
-- acct: Supabase's auth.jwt() (claims of the request: aal, amr…) and the MFA factors table (accounts v4)
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.jwt() to anon, authenticated;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  friendly_name text, factor_type text not null default 'totp', status text not null default 'unverified', created_at timestamptz default now(), updated_at timestamptz default now());
create schema storage; grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, owner uuid);
create unique index objects_bucket_name on storage.objects(bucket_id, name);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema if not exists extensions; grant usage on schema extensions to anon, authenticated;
create extension if not exists pgcrypto with schema extensions;
"""

def psql(db, sql=None, f=None):
    cmd = ['psql', '-h', SOCK, '-p', PORT, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=0']
    cmd += ['-f', f] if f else ['-c', sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if 'connection to server' in out and 'failed' in out:
        sys.exit(f'psql: cannot reach the test cluster at {SOCK} — run tools/tests/sql/setup_pg.sh start\n{out}')
    return out

def errs(out): return [l for l in out.splitlines() if 'ERROR' in l]

def now(days=0):
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%S.000000Z')

def sign(body, secret):
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()

class Db:
    def __init__(self, name, assistant=False, rerun=2):
        self.name = name; self.ok = 0; self.bad = []; self.t0 = time.time()
        psql('postgres', f'drop database if exists {name}')
        psql('postgres', f'create database {name}')
        e = errs(psql(name, sql=STUB)); assert not e, e
        self.check('schema.sql loads on a fresh database', str(errs(psql(name, f=SCHEMA))), '[]')
        for i in range(rerun):
            self.check(f'schema.sql re-run {i + 1} (idempotent)', str(errs(psql(name, f=SCHEMA))), '[]')
        if assistant:
            for i in range(2):
                self.check(f'assistant.sql run {i + 1}', str(errs(psql(name, f=ASSISTANT))), '[]')
    def sql(self, s): return psql(self.name, s)
    def file(self, f): return psql(self.name, f=f)
    def as_(self, uid, s):
        """Run as anon (uid None) or an authenticated user; returns the first ERROR line or the last output line."""
        pre = "set role anon;" if uid is None else f"set role authenticated; set request.jwt.claim.sub='{uid}';"
        o = psql(self.name, pre + s)
        e = errs(o)
        return e[0] if e else (o.splitlines()[-1] if o else '')
    def user(self, uid, email, username, **meta):
        self.sql(f"insert into auth.users(id,email,raw_user_meta_data) values ('{uid}','{email}','{json.dumps({'username': username, **meta})}')")
        time.sleep(0.01)   # distinct created_at (the first account becomes the owner)
    def check(self, label, out, want):
        good = (want in out) if isinstance(want, str) else bool(want(out))
        if good: self.ok += 1
        else: self.bad.append(label)
        print(('  ok  ' if good else '  FAIL'), f'{label:<62}', '|', out.replace('\n', ' ⏎ ')[:120], flush=True)
        return good
    def section(self, s): print(f'== {s}  [{time.time() - self.t0:.0f}s]', flush=True)
    def finish(self):
        print(f'\n{self.name}: {self.ok} ok, {len(self.bad)} failed ({time.time() - self.t0:.1f}s)' + (f' → {self.bad}' if self.bad else ''), flush=True)
        sys.exit(1 if self.bad else 0)
