-- Store the Threads profile returned by graph.threads.net/v1.0/me after OAuth.

ALTER TABLE threads_connections ADD COLUMN threads_username TEXT;

CREATE INDEX IF NOT EXISTS idx_threads_connections_username ON threads_connections(threads_username);
