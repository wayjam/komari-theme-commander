/**
 * System icon helpers
 * ------------------------------------------------------------------
 * Map free-form strings reported by Komari agent (os / arch / virt)
 * to a renderable icon component, with safe fallbacks.
 *
 * Usage:
 *   const { Icon } = getOsIcon(node.os);
 *   <Icon className="h-3.5 w-3.5 text-primary" />
 *
 *   // or declarative:
 *   <SystemIcon kind="os" value={node.os} className="h-3.5 w-3.5 text-primary" />
 *
 * Adding new mappings: just append a `{ test, Icon, label, brand? }`
 * entry to the relevant table — first match wins.
 */
import type { ComponentType, SVGProps } from 'react';
import {
  SiUbuntu,
  SiDebian,
  SiCentos,
  SiAlmalinux,
  SiRockylinux,
  SiArchlinux,
  SiFedora,
  SiRedhat,
  SiAlpinelinux,
  SiOpensuse,
  SiKalilinux,
  SiManjaro,
  SiGentoo,
  SiLinuxmint,
  SiNixos,
  SiAndroid,
  SiFreebsd,
  SiOpenbsd,
  SiApple,
  SiLinux,
  SiDocker,
  SiKubernetes,
  SiProxmox,
  SiVmware,
  SiQemu,
  SiIntel,
  SiAmd,
  SiNvidia,
  SiArm,
  SiQualcomm,
  SiMediatek,
  SiRaspberrypi,
} from 'react-icons/si';
import { FaWindows } from 'react-icons/fa';
import { Box, CircuitBoard, Cpu, Layers, Monitor, Server } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */

/** Icon component type — accepts standard SVG props (className/style/etc). */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export interface ResolvedIcon {
  /** The icon component to render. */
  Icon: IconComponent;
  /** Canonical label (e.g. "Ubuntu", "x86_64"). Useful for tooltips/aria. */
  label: string;
  /** Optional brand color (hex). Caller can opt into using it. */
  brand?: string;
}

interface MatcherEntry {
  /** Lowercased keywords; any hit wins. Use word-ish fragments. */
  keywords: string[];
  Icon: IconComponent;
  label: string;
  brand?: string;
}

/* ──────────────────────────────────────────────────────────────
   Internal: match helper
   ────────────────────────────────────────────────────────────── */

function matchEntry(input: string | undefined | null, table: MatcherEntry[], fallback: ResolvedIcon): ResolvedIcon {
  if (!input) return fallback;
  const s = input.toLowerCase();
  for (const entry of table) {
    if (entry.keywords.some(k => s.includes(k))) {
      return { Icon: entry.Icon, label: entry.label, brand: entry.brand };
    }
  }
  return fallback;
}

/* ──────────────────────────────────────────────────────────────
   OS table — order matters (more specific first)
   ────────────────────────────────────────────────────────────── */

const OS_TABLE: MatcherEntry[] = [
  // Linux distros — specific first
  { keywords: ['ubuntu'], Icon: SiUbuntu, label: 'Ubuntu', brand: '#E95420' },
  { keywords: ['linux mint', 'linuxmint'], Icon: SiLinuxmint, label: 'Linux Mint', brand: '#86BE43' },
  { keywords: ['debian'], Icon: SiDebian, label: 'Debian', brand: '#A81D33' },
  { keywords: ['almalinux', 'alma linux', 'alma'], Icon: SiAlmalinux, label: 'AlmaLinux', brand: '#0D597F' },
  { keywords: ['rocky'], Icon: SiRockylinux, label: 'Rocky Linux', brand: '#10B981' },
  { keywords: ['centos'], Icon: SiCentos, label: 'CentOS', brand: '#262577' },
  { keywords: ['red hat', 'redhat', 'rhel'], Icon: SiRedhat, label: 'Red Hat', brand: '#EE0000' },
  { keywords: ['fedora'], Icon: SiFedora, label: 'Fedora', brand: '#51A2DA' },
  { keywords: ['arch'], Icon: SiArchlinux, label: 'Arch Linux', brand: '#1793D1' },
  { keywords: ['manjaro'], Icon: SiManjaro, label: 'Manjaro', brand: '#35BF5C' },
  { keywords: ['alpine'], Icon: SiAlpinelinux, label: 'Alpine', brand: '#0D597F' },
  { keywords: ['opensuse', 'suse'], Icon: SiOpensuse, label: 'openSUSE', brand: '#73BA25' },
  { keywords: ['kali'], Icon: SiKalilinux, label: 'Kali', brand: '#557C94' },
  { keywords: ['gentoo'], Icon: SiGentoo, label: 'Gentoo', brand: '#54487A' },
  { keywords: ['nixos', 'nix os'], Icon: SiNixos, label: 'NixOS', brand: '#5277C3' },
  { keywords: ['android'], Icon: SiAndroid, label: 'Android', brand: '#3DDC84' },

  // BSD family
  { keywords: ['freebsd'], Icon: SiFreebsd, label: 'FreeBSD', brand: '#AB2B28' },
  { keywords: ['openbsd'], Icon: SiOpenbsd, label: 'OpenBSD', brand: '#F2CA30' },

  // Apple — Komari often reports "Darwin xx.x"
  { keywords: ['darwin', 'macos', 'mac os', 'osx', 'os x'], Icon: SiApple, label: 'macOS', brand: '#999999' },

  // Windows
  { keywords: ['windows', 'winserver', 'win '], Icon: FaWindows, label: 'Windows', brand: '#0078D6' },

  // Generic linux fallback (after specific distros)
  { keywords: ['linux', 'gnu'], Icon: SiLinux, label: 'Linux', brand: '#FCC624' },
];

const OS_FALLBACK: ResolvedIcon = { Icon: Monitor, label: 'OS' };

export function getOsIcon(os: string | undefined | null): ResolvedIcon {
  return matchEntry(os, OS_TABLE, OS_FALLBACK);
}

/* ──────────────────────────────────────────────────────────────
   Arch table
   ────────────────────────────────────────────────────────────── */

const ARCH_TABLE: MatcherEntry[] = [
  // arm64 family
  { keywords: ['aarch64', 'arm64'], Icon: CircuitBoard, label: 'ARM64' },
  { keywords: ['armv7', 'armv6', 'armhf', 'arm'], Icon: CircuitBoard, label: 'ARM' },
  // x86 family
  { keywords: ['x86_64', 'amd64', 'x64'], Icon: Cpu, label: 'x86_64' },
  { keywords: ['i386', 'i686', 'x86'], Icon: Cpu, label: 'x86' },
  // others
  { keywords: ['riscv64', 'riscv'], Icon: Cpu, label: 'RISC-V' },
  { keywords: ['mips'], Icon: Cpu, label: 'MIPS' },
  { keywords: ['ppc', 'powerpc'], Icon: Cpu, label: 'PowerPC' },
  { keywords: ['s390'], Icon: Cpu, label: 's390x' },
  { keywords: ['loong', 'loongarch'], Icon: Cpu, label: 'LoongArch' },
];

const ARCH_FALLBACK: ResolvedIcon = { Icon: Layers, label: 'Arch' };

export function getArchIcon(arch: string | undefined | null): ResolvedIcon {
  return matchEntry(arch, ARCH_TABLE, ARCH_FALLBACK);
}

/* ──────────────────────────────────────────────────────────────
   Virtualization table
   ────────────────────────────────────────────────────────────── */

const VIRT_TABLE: MatcherEntry[] = [
  { keywords: ['docker', 'lxc', 'lxd', 'container'], Icon: SiDocker, label: 'Container', brand: '#2496ED' },
  { keywords: ['kubernetes', 'k8s'], Icon: SiKubernetes, label: 'Kubernetes', brand: '#326CE5' },
  { keywords: ['proxmox', 'pve'], Icon: SiProxmox, label: 'Proxmox', brand: '#E57000' },
  { keywords: ['vmware', 'esxi', 'vsphere'], Icon: SiVmware, label: 'VMware', brand: '#607078' },
  { keywords: ['kvm', 'qemu'], Icon: SiQemu, label: 'KVM/QEMU', brand: '#FF6600' },
  { keywords: ['xen'], Icon: Server, label: 'Xen' },
  { keywords: ['hyper-v', 'hyperv'], Icon: FaWindows, label: 'Hyper-V', brand: '#0078D6' },
  { keywords: ['openvz', 'vz'], Icon: Box, label: 'OpenVZ' },
  { keywords: ['vbox', 'virtualbox'], Icon: Box, label: 'VirtualBox' },
];

const VIRT_FALLBACK: ResolvedIcon = { Icon: Box, label: 'Virtualization' };

export function getVirtIcon(virt: string | undefined | null): ResolvedIcon {
  return matchEntry(virt, VIRT_TABLE, VIRT_FALLBACK);
}

/* ──────────────────────────────────────────────────────────────
   CPU vendor table — detect by cpu_name string
   e.g. "Intel(R) Xeon(R) Gold 6248R" / "AMD EPYC 7763" / "Apple M3 Pro" /
   "Ampere Altra" / "Neoverse-N1" / "Qualcomm Snapdragon" / "Loongson 3A5000"
   ────────────────────────────────────────────────────────────── */

const CPU_TABLE: MatcherEntry[] = [
  { keywords: ['intel', 'xeon', 'pentium', 'celeron', 'core i', 'core(tm)'], Icon: SiIntel, label: 'Intel', brand: '#0071C5' },
  { keywords: ['amd', 'epyc', 'ryzen', 'threadripper', 'opteron'], Icon: SiAmd, label: 'AMD', brand: '#ED1C24' },
  { keywords: ['apple m1', 'apple m2', 'apple m3', 'apple m4', 'apple silicon'], Icon: SiApple, label: 'Apple Silicon', brand: '#A2AAAD' },
  { keywords: ['raspberry', 'bcm2'], Icon: SiRaspberrypi, label: 'Raspberry Pi', brand: '#A22846' },
  { keywords: ['snapdragon', 'qualcomm', 'kryo'], Icon: SiQualcomm, label: 'Qualcomm', brand: '#3253DC' },
  { keywords: ['mediatek', 'mtk', 'dimensity', 'helio'], Icon: SiMediatek, label: 'MediaTek', brand: '#EC9430' },
  { keywords: ['ampere', 'neoverse', 'cortex', 'arm '], Icon: SiArm, label: 'ARM', brand: '#0091BD' },
  { keywords: ['loongson', 'loong'], Icon: CircuitBoard, label: 'Loongson' },
  { keywords: ['hygon'], Icon: CircuitBoard, label: 'Hygon' },
  { keywords: ['phytium', 'feiteng'], Icon: CircuitBoard, label: 'Phytium' },
];

const CPU_FALLBACK: ResolvedIcon = { Icon: Cpu, label: 'CPU' };

export function getCpuVendorIcon(cpuName: string | undefined | null): ResolvedIcon {
  return matchEntry(cpuName, CPU_TABLE, CPU_FALLBACK);
}

/* ──────────────────────────────────────────────────────────────
   GPU vendor table — detect by gpu_name string
   e.g. "NVIDIA GeForce RTX 4090" / "AMD Radeon RX 7900" /
   "Intel Arc A770" / "Apple M3 Max (GPU)"
   ────────────────────────────────────────────────────────────── */

const GPU_TABLE: MatcherEntry[] = [
  { keywords: ['nvidia', 'geforce', 'quadro', 'tesla', 'rtx', 'gtx'], Icon: SiNvidia, label: 'NVIDIA', brand: '#76B900' },
  { keywords: ['radeon', 'amd '], Icon: SiAmd, label: 'AMD Radeon', brand: '#ED1C24' },
  { keywords: ['intel', 'arc', 'iris', 'uhd graphics', 'hd graphics'], Icon: SiIntel, label: 'Intel Graphics', brand: '#0071C5' },
  { keywords: ['apple', 'm1', 'm2', 'm3', 'm4'], Icon: SiApple, label: 'Apple GPU', brand: '#A2AAAD' },
  { keywords: ['mali', 'adreno'], Icon: SiArm, label: 'Mobile GPU', brand: '#0091BD' },
];

const GPU_FALLBACK: ResolvedIcon = { Icon: Box, label: 'GPU' };

export function getGpuVendorIcon(gpuName: string | undefined | null): ResolvedIcon {
  return matchEntry(gpuName, GPU_TABLE, GPU_FALLBACK);
}

/* ──────────────────────────────────────────────────────────────
   Declarative wrapper component
   ────────────────────────────────────────────────────────────── */

export type SystemIconKind = 'os' | 'arch' | 'virt' | 'cpu' | 'gpu';

export interface SystemIconProps extends SVGProps<SVGSVGElement> {
  kind: SystemIconKind;
  value: string | undefined | null;
  /** When true, apply the brand color via inline style (overrides text color). */
  useBrandColor?: boolean;
  className?: string;
}

const RESOLVERS: Record<SystemIconKind, (v: string | null | undefined) => ResolvedIcon> = {
  os: getOsIcon,
  arch: getArchIcon,
  virt: getVirtIcon,
  cpu: getCpuVendorIcon,
  gpu: getGpuVendorIcon,
};

export function SystemIcon({ kind, value, useBrandColor, style, ...rest }: SystemIconProps) {
  const { Icon, brand, label } = RESOLVERS[kind](value);
  const finalStyle = useBrandColor && brand ? { color: brand, ...style } : style;
  return <Icon aria-label={label} style={finalStyle} {...rest} />;
}
