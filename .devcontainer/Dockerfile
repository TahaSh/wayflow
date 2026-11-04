# Node 22 to match CI, with git, sudo and a non-root `node` user
FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

RUN apt-get update && \
    apt-get install -y --no-install-recommends figlet && \
    rm -rf /var/lib/apt/lists/*

# pnpm comes from corepack, pinned by `packageManager` in package.json
RUN npm uninstall -g pnpm 2>/dev/null; corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Welcome banner in every interactive shell
COPY ./etc/update-motd.d/00-header /etc/update-motd.d/
RUN chmod +x /etc/update-motd.d/00-header && \
    echo 'bash /etc/update-motd.d/00-header' >> /home/node/.bashrc && \
    echo 'bash /etc/update-motd.d/00-header' >> /home/node/.zshrc
