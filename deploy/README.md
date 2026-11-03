# Deploying vizDSA

These files have not been run on a real server yet. Their syntax is checked, but treat the first deploy as a test.

Use a VM with nothing else valuable on it, about 2 vCPUs and 4 GB of memory. The API account controls Docker, which
is equivalent to root on that machine.

## Set up the VM

1.  Install Docker, Node 22.18 or later, and Caddy.
2.  Install gVisor from its apt repository, following gvisor.dev/docs/user_guide/install. The
    `releases/release/latest` download URL returned 404 when this was written, so prefer apt or a dated release.
3.  Copy `daemon.json` to `/etc/docker/daemon.json` and restart Docker. Merge it if that file already exists.
4.  Create a user named `vizdsa`, and the folder `/srv/vizdsa`.
5.  Copy `Caddyfile` to `/etc/caddy/Caddyfile` with your domain, and `vizdsa-api.service` to `/etc/systemd/system/`.

## Deploy

1.  Build the web app with `npm run build`, and build the images with `npm run build:images`. Tag images by release so
    the previous ones stay available.
2.  Put the repo and `apps/web/dist` in a new folder under `/srv/vizdsa/releases/<date>`, as `repo` and `web`.
3.  Run `npm install --omit=dev` in `repo`, and point the `/srv/vizdsa/current` symlink at the new folder.
4.  Restart with `systemctl restart vizdsa-api`.

Check it with the conformance tests, using the real runtime:

```bash
SANDBOX_RUNTIME=runsc npm run test:conformance
```

Without `SANDBOX_RUNTIME_CPP`, the test fails on C++ with a "not enabled" error. That is the expected refusal.

## Roll back

Point `/srv/vizdsa/current` at the previous release and restart the API. There is no data to migrate.

## Settings

| Setting               | Default  | Meaning                                                                 |
|-----------------------|----------|-------------------------------------------------------------------------|
| `SANDBOX_RUNTIME`     | `runsc`  | Container runtime for Python and Java.                                  |
| `SANDBOX_RUNTIME_CPP` | not set  | Runtime for C++. With no value, C++ is refused.                         |
| `RUN_LIMITS`          | on       | `off` removes the hourly, daily and queue limits. Local development only. |
| `PORT`                | `8787`   | API port. Caddy expects 8787.                                           |

All numeric limits are in `apps/api/src/limits.ts`.
