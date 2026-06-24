FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    softhsm2 \
    opensc \
    libengine-pkcs11-openssl \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Répertoire tokens persistant
RUN mkdir -p /var/lib/softhsm/tokens && \
    chown -R root:root /var/lib/softhsm

COPY init-softhsm.sh /usr/local/bin/init-softhsm.sh
RUN chmod +x /usr/local/bin/init-softhsm.sh

# Configuration SoftHSM2
RUN mkdir -p /etc/softhsm2
COPY softhsm2.conf /etc/softhsm2/softhsm2.conf
ENV SOFTHSM2_CONF=/etc/softhsm2/softhsm2.conf

VOLUME ["/var/lib/softhsm/tokens"]

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD softhsm2-util --show-slots

CMD ["/usr/local/bin/init-softhsm.sh"]
