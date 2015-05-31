FROM          gliderlabs/alpine:3.2
MAINTAINER    Jonas Finnemann Jensen <jopsen@gmail.com>

# Install dependencies
RUN apk-install iptables ca-certificates lxc e2fsprogs device-mapper docker nodejs

# Install the dind-service from this folder
RUN         mkdir -p /opt/dind-service
WORKDIR     /opt/dind-service
COPY        . /opt/dind-service
RUN         npm install --production \
         && npm cache clear \
         && chmod +x ./entrypoint.sh \
            ;

# Mount volume at /var/lib/docker for AUFS to work, and expose docket socket
VOLUME      /var/lib/docker
EXPOSE      2375
ENV         PORT                2375

# Pipe log out by default, set it to 'file' to use /var/log/docker.log
# Also configure proxy DEBUG-level, set it to '*' for more informational logs
ENV         LOG                 pipe
ENV         DEBUG               ''

# Warn people against building from this image, that is not the intend. You
# should use this image to setup a docker daemon you can expose.
ONBUILD     echo "If you build from this image you doing something wrong." \
            exit 1;

# Default entry-point starts docker daemon and validating proxy
ENTRYPOINT  ./entrypoint.sh