import React from 'react';
import {
  Globe,
  Code2,
  MessageSquare,
  Gamepad2,
  Music,
  Terminal,
  Container,
  Server,
  Shield,
  Download,
  Cpu,
  AppWindow,
} from 'lucide-react';

interface AppIconBadgeProps {
  name: string;
  executablePath?: string | null;
  category?: string;
  size?: 'sm' | 'md' | 'lg';
}

function getAppVisual(name: string, executablePath?: string | null, category?: string) {
  const lower = `${name} ${executablePath || ''}`.toLowerCase();

  if (/(chrome|chromium|firefox|edge|msedge|brave|opera|vivaldi|safari|arc|zen)/.test(lower)) {
    return {
      Icon: Globe,
      colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    };
  }
  if (/(code|vscode|cursor|zed|windsurf|idea|pycharm|rustrover|clion|goland|nvim|vim|sublime)/.test(lower)) {
    return {
      Icon: Code2,
      colorClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
    };
  }
  if (/(discord|slack|telegram|teams|zoom|signal|element|thunderbird|whatsapp)/.test(lower)) {
    return {
      Icon: MessageSquare,
      colorClass: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
    };
  }
  if (/(steam|epic|lutris|heroic|minecraft|roblox|proton)/.test(lower)) {
    return {
      Icon: Gamepad2,
      colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    };
  }
  if (/(spotify|vlc|mpv|obs|ffmpeg|plex|tidal|audacious)/.test(lower)) {
    return {
      Icon: Music,
      colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    };
  }
  if (/(docker|podman|containerd|kubectl|k3s|minikube)/.test(lower)) {
    return {
      Icon: Container,
      colorClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
    };
  }
  if (/(nginx|apache|httpd|caddy|traefik|postgres|mysqld|redis|mongod)/.test(lower)) {
    return {
      Icon: Server,
      colorClass: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
    };
  }
  if (/(ssh|sshd|openvpn|wireguard|wg|tailscale|mullvad|protonvpn|tor|clash)/.test(lower)) {
    return {
      Icon: Shield,
      colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    };
  }
  if (/(curl|wget|aria2|qbittorrent|transmission|deluge|apt|pacman|yay|paru|dnf|npm|yarn|pnpm|pip)/.test(lower)) {
    return {
      Icon: Download,
      colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    };
  }
  if (/(node|tsx|python|python3|deno|bun|cargo|rustc|go|java|ruby|bash|zsh|fish|pwsh|powershell)/.test(lower)) {
    return {
      Icon: Terminal,
      colorClass: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25',
    };
  }
  if (category === 'system' || /(systemd|svchost|lsass|services|kworker|networkmanager|resolved|avahi|chronyd|ntpd)/.test(lower)) {
    return {
      Icon: Cpu,
      colorClass: 'text-slate-300 bg-slate-500/10 border-slate-500/25',
    };
  }

  return {
    Icon: AppWindow,
    colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  };
}

export const AppIconBadge: React.FC<AppIconBadgeProps> = ({
  name,
  executablePath,
  category,
  size = 'md',
}) => {
  const { Icon, colorClass } = getAppVisual(name, executablePath, category);

  const boxSize =
    size === 'lg'
      ? 'w-10 h-10 rounded-lg'
      : size === 'sm'
      ? 'w-7 h-7 rounded'
      : 'w-8 h-8 rounded-md';

  const iconSize = size === 'lg' ? 'w-5 h-5' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div
      className={`${boxSize} ${colorClass} border flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      <Icon className={iconSize} />
    </div>
  );
};
