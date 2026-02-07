#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
#  coParrot Installer
#  https://github.com/ddVital/coParrot
# ──────────────────────────────────────────────

PACKAGE="coparrot"
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

info()  { printf "${CYAN}▸${RESET} %s\n" "$1"; }
ok()    { printf "${GREEN}✔${RESET} %s\n" "$1"; }
warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$1"; }
error() { printf "${RED}✖${RESET} %s\n" "$1" >&2; }

# ── Check for required commands ──────────────────────────────────
check_cmd() {
  command -v "$1" >/dev/null 2>&1
}

# ── Detect package manager ───────────────────────────────────────
detect_pkg_manager() {
  if check_cmd npm; then
    echo "npm"
  elif check_cmd yarn; then
    echo "yarn"
  elif check_cmd pnpm; then
    echo "pnpm"
  else
    echo ""
  fi
}

# ── Install Node.js if missing ───────────────────────────────────
install_node() {
  info "Node.js is required but not found."
  echo ""

  if check_cmd curl; then
    FETCH="curl -fsSL"
  elif check_cmd wget; then
    FETCH="wget -qO-"
  else
    error "Neither curl nor wget found. Please install Node.js manually:"
    echo "  https://nodejs.org/en/download"
    exit 1
  fi

  printf "  Install Node.js via:\n"
  printf "    ${BOLD}1)${RESET} nvm (recommended)\n"
  printf "    ${BOLD}2)${RESET} fnm (fast node manager)\n"
  printf "    ${BOLD}3)${RESET} Skip — I'll install it myself\n"
  echo ""
  printf "  Choice [1/2/3]: "

  # When piped (curl | bash), stdin is the pipe — read from terminal instead
  if [ -t 0 ]; then
    read -r choice
  elif [ -e /dev/tty ]; then
    read -r choice < /dev/tty
  else
    error "Cannot read input. Download and run the script directly instead:"
    echo "  curl -fsSL https://raw.githubusercontent.com/ddVital/coParrot/main/install.sh -o install.sh"
    echo "  bash install.sh"
    exit 1
  fi

  case "$choice" in
    1)
      info "Installing nvm..."
      $FETCH https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
      export NVM_DIR="${HOME}/.nvm"
      # shellcheck disable=SC1091
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm install --lts
      nvm use --lts
      ;;
    2)
      info "Installing fnm..."
      $FETCH https://fnm.vercel.app/install | bash
      eval "$(fnm env)"
      fnm install --lts
      fnm use lts-latest
      ;;
    *)
      echo ""
      warn "Skipping Node.js installation."
      echo "  Install Node.js (>= 18) and re-run this script."
      echo "  https://nodejs.org/en/download"
      exit 0
      ;;
  esac

  echo ""
  ok "Node.js $(node -v) installed"
}

# ── Main ─────────────────────────────────────────────────────────
main() {
  echo ""
  printf "${GREEN}${BOLD}"
  printf "  ╔═══════════════════════════════════╗\n"
  printf "  ║       coParrot Installer          ║\n"
  printf "  ╚═══════════════════════════════════╝\n"
  printf "${RESET}"
  echo ""

  # 1. Check for Node.js
  if ! check_cmd node; then
    install_node
  else
    local node_version
    node_version="$(node -v)"
    local major
    major="${node_version#v}"
    major="${major%%.*}"
    if [ "$major" -lt 18 ]; then
      warn "Node.js ${node_version} found, but >= 18 is required."
      install_node
    else
      ok "Node.js ${node_version} found"
    fi
  fi

  # 2. Detect package manager
  local pkg_manager
  pkg_manager="$(detect_pkg_manager)"

  if [ -z "$pkg_manager" ]; then
    error "No package manager (npm, yarn, pnpm) found."
    error "This should not happen if Node.js is installed. Try restarting your shell."
    exit 1
  fi

  ok "Using ${pkg_manager}"

  # 3. Install coparrot globally
  info "Installing ${PACKAGE} globally..."
  echo ""

  # Use sudo on Linux when Node was installed system-wide (not via nvm/fnm)
  local use_sudo=""
  if [ "$(uname -s)" != "Darwin" ] && [ -z "${NVM_DIR:-}" ] && [ -z "${FNM_DIR:-}" ]; then
    local npm_prefix
    npm_prefix="$(npm prefix -g 2>/dev/null || echo "")"
    if [ -n "$npm_prefix" ] && [ ! -w "$npm_prefix/lib" ]; then
      use_sudo="sudo"
      warn "Global npm directory is not writable — using sudo"
    fi
  fi

  case "$pkg_manager" in
    npm)  $use_sudo npm install -g "$PACKAGE" ;;
    yarn) $use_sudo yarn global add "$PACKAGE" ;;
    pnpm) $use_sudo pnpm add -g "$PACKAGE" ;;
  esac

  echo ""

  # 4. Verify installation
  if check_cmd coparrot || check_cmd cpt; then
    ok "${PACKAGE} installed successfully!"
    echo ""
    printf "  Get started:\n"
    printf "    ${BOLD}coparrot${RESET}       Start interactive mode\n"
    printf "    ${BOLD}cpt${RESET}            Short alias\n"
    printf "    ${BOLD}coparrot setup${RESET} Configure your AI provider\n"
    echo ""
  else
    warn "Installation finished but 'coparrot' not found in PATH."
    echo "  You may need to restart your terminal or add the global"
    echo "  npm bin directory to your PATH:"
    echo ""
    echo "    export PATH=\"\$(npm prefix -g)/bin:\$PATH\""
    echo ""
  fi
}

main "$@"
