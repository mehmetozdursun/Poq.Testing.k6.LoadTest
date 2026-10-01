#!/bin/bash
# Route a device's traffic through Charles (port 8888 on this Mac), check it, or turn it off.
#
#   proxy.sh android on|off|status [serial]    emulator: 10.0.2.2 is the host Mac
#   proxy.sh ios status [udid]                  simulator uses the Mac's network: see notes below
#
# Android emulator:
#   - "on" sets the global HTTP proxy; "off" removes it (always run "off" when the capture is done).
#   - The app must trust the Charles CA. Dev/debug builds usually trust user CAs; install the cert via
#     Charles > Help > SSL Proxying > Save Charles Root Certificate, drag it onto the emulator and add
#     it under Settings > Security > Encryption & credentials > Install a certificate > CA.
#   - A physical Android phone: set the Wi-Fi proxy by hand to <this Mac's IP>:8888 instead.
# iOS simulator:
#   - No per-device proxy: the simulator uses the Mac's network, so enable Charles > Proxy > macOS Proxy.
#   - Trust: Charles > Help > SSL Proxying > Install Charles Root Certificate in iOS Simulators
#     (or: xcrun simctl keychain <udid> add-root-cert <charles-root.pem>), then restart the app.
#   - A physical iPhone: Wi-Fi > (i) > Configure Proxy > Manual <this Mac's IP>:8888, open
#     chls.pro/ssl, install the profile, and enable full trust in Settings > General > About >
#     Certificate Trust Settings. Remove the proxy afterwards.
set -euo pipefail
PLATFORM="${1:?android|ios}"; ACTION="${2:?on|off|status}"; DEVICE="${3:-}"
case "$PLATFORM" in
  android)
    ADB=(adb); [ -n "$DEVICE" ] && ADB=(adb -s "$DEVICE")
    case "$ACTION" in
      on)     "${ADB[@]}" shell settings put global http_proxy 10.0.2.2:8888 ;;
      off)    "${ADB[@]}" shell settings put global http_proxy :0 ;;
      status) ;;
      *) echo "android: on|off|status" >&2; exit 2 ;;
    esac
    echo "android http_proxy: $("${ADB[@]}" shell settings get global http_proxy)" ;;
  ios)
    [ "$ACTION" = "status" ] || { echo "iOS has no per-device proxy; see the notes at the top of this script" >&2; exit 2; }
    xcrun simctl list devices booted | grep -E "Booted" || echo "no booted simulator"
    echo "macOS web proxy: $(networksetup -getwebproxy Wi-Fi 2>/dev/null | tr '\n' ' ')"
    echo "(Charles sets this when Proxy > macOS Proxy is on)" ;;
  *) echo "platform must be android or ios" >&2; exit 2 ;;
esac
# Charles reachable?
curl -s -m 5 -x http://127.0.0.1:8888 http://control.charles/ >/dev/null \
  && echo "Charles web interface: reachable" \
  || echo "Charles web interface: NOT reachable (start Charles; enable Proxy > Web Interface Settings)"
