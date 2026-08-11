{pkgs}: {
  deps = [
    pkgs.libgbm
    pkgs.at-spi2-core
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.pango
    pkgs.cairo
    pkgs.xorg.libXext
    pkgs.xorg.libX11
    pkgs.mesa
    pkgs.alsa-lib
    pkgs.libxkbcommon
    pkgs.xorg.libxcb
    pkgs.cups
    pkgs.dbus
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.nss
    pkgs.nspr
    pkgs.glib
  ];
}
