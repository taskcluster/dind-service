Docker-in-Docker Service
========================
This aims to offer docker as a service running in docker with a proxy validating
that containers created are unprivileged, have no capabilities and don't mount
anything from host.

So even though the dind-service runs in `--privileged` mode anyone with access
to the proxied docker daemon socket should only be able to run unprivileged
containers. This way it should be reasonably safe to expose the proxied docker
daemon socket to untrusted parties.

```bash
# Build image
docker build -t dind-service .

# Create volumes folder on host that we can mount in, for AUFS to use in the
# container. This is easier to clean-up than docker data-volumes.
mkdir -p volumes

# Run dind-service
sudo docker run \
            --privileged \
            -v `pwd`/volumes:/var/lib/docker \
            -p 2375:2375 \
            dind-service \
            $DOCKER_DAEMON_ARGS

# Remove volumes from host
sudo rm -rf volumes/ && mkdir -p volumes
```

Upgrading Docker
----------------
To update the docker daemon inside this container we have to upgrade Alpine
Linux version (or rebuild docker manually), either way when upgrading docker
it's important to validate that the new remote API doesn't expose new ways to
elevate container permissions. If so we must adopt to proxy to restrict these
calls.
