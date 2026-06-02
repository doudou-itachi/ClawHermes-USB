<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Electroview } from "electrobun/view";
import type { BootstrapPayload, ChannelLoginStatus, DeviceBindingStatus, LogPayload, ModelConfig, PortableSkill, ServiceStatus, SkillsPayload, StatusPayload } from "../shared/types";
import dtclawLogo from "./assets/dtclaw-logo.png";
import product12Image from "./assets/product12.png";

type IconName =
  | "home"
  | "bot"
  | "plug"
  | "target"
  | "hermes"
  | "terminal"
  | "service"
  | "zap"
  | "disk"
  | "globe"
  | "panel"
  | "check"
  | "stack"
  | "pulse"
  | "play"
  | "stop"
  | "refresh"
  | "maximize"
  | "spark";

const rpc = Electroview.defineRPC({ handlers: { requests: {}, messages: {} } });
const electrobun = new Electroview({ rpc });

const icons: Record<IconName, string> = {
  home: "M3.8 10.4 12 3.6l8.2 6.8v9.2a.8.8 0 0 1-.8.8h-5.1v-5.8H9.7v5.8H4.6a.8.8 0 0 1-.8-.8v-9.2Z",
  bot: "M7 9.5h10a4 4 0 0 1 4 4v2.2a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-2.2a4 4 0 0 1 4-4Zm1.5 4.2h.1m6.9 0h.1M12 9.5V5.2m-2.4 0h4.8",
  plug: "M8 3.5v5m8-5v5M6.5 8.5h11v2.8a5.5 5.5 0 0 1-5.5 5.5h0a5.5 5.5 0 0 1-5.5-5.5V8.5Zm5.5 8.3v3.7",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.2a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6Zm0-2.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z",
  hermes: "M8 4h8v12H8V4Zm2 12h4v4h-4v-4Zm-.2-8.2h4.4m-4.4 4.4h4.4",
  terminal: "M4 6h16v12H4V6Zm3.2 3.6 2.2 2.4-2.2 2.4m4-.1h5.4",
  service: "M8.4 8.4h7.2v7.2H8.4V8.4ZM3.7 12h4.7m7.2 0h4.7M12 3.7v4.7m0 7.2v4.7M5.8 5.8l2.6 2.6m7.2 7.2 2.6 2.6m0-12.4-2.6 2.6m-7.2 7.2-2.6 2.6",
  zap: "M13 2.8 5.7 13h5.2L10 21.2 18.3 10h-5.5L13 2.8Z",
  disk: "M5 4h12l2 2v14H5V4Zm3 0v6h8V4M8 16h8",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.1-2.2 3.2-5.2 3.2-9S14.1 5.2 12 3m0 18c-2.1-2.2-3.2-5.2-3.2-9S9.9 5.2 12 3M3.8 12h16.4",
  panel: "M4 5h16v14H4V5Zm0 4h16M9 9v10",
  check: "M5 12.6 9.2 17 19 7",
  stack: "M12 3.5 4.5 7.3 12 11l7.5-3.7L12 3.5Zm-7.5 8.2 7.5 3.8 7.5-3.8M4.5 16l7.5 3.8 7.5-3.8",
  pulse: "M4 12h3l2-5 4 10 2-5h5",
  play: "M8 5.5v13l10-6.5L8 5.5Z",
  stop: "M7 7h10v10H7V7Z",
  refresh: "M20 6v5h-5M4 18v-5h5m9.2-4.8A7 7 0 0 0 6.6 7.6L4 11m16 2-2.6 3.4A7 7 0 0 1 5.8 15.8",
  maximize: "M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4",
  spark: "M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8-5.8-1.7 5.8-1.7L12 3.2Zm6.2 11.4.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7 2.4-.7.7-2.4Z",
};

const IconGlyph = (props: { name: IconName }) =>
  h(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.9",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    [h("path", { d: icons[props.name] })],
  );

const tabs: Array<{ id: string; label: string; icon: IconName; tone: string }> = [
  { id: "console", label: "控制台", icon: "home", tone: "sky" },
  { id: "models", label: "模型配置", icon: "bot", tone: "violet" },
  { id: "channels", label: "渠道接入", icon: "target", tone: "rose" },
  { id: "skills", label: "技能中心", icon: "spark", tone: "cyan" },
  { id: "services", label: "服务", icon: "plug", tone: "blue" },
  { id: "logs", label: "运行日志", icon: "terminal", tone: "emerald" },
  { id: "settings", label: "设置", icon: "service", tone: "amber" },
];

type ProviderPreset = {
  id: string;
  label: string;
  short: string;
  tone: string;
  tags: string[];
  baseUrl: string;
  model: string;
  keyUrl?: string;
};

const providerPresets: ProviderPreset[] = [
  { id: "mixedcloud", label: "融云API", short: "融", tone: "cyan", tags: ["官网", "OpenAI 兼容"], baseUrl: "https://models.mixedcloud.cn/v1", model: "", keyUrl: "https://models.mixedcloud.cn" },
  { id: "custom", label: "自定义", short: "自", tone: "violet", tags: ["兼容", "手动填写"], baseUrl: "", model: "" },
];

const serviceFeatureCards = [
  {
    title: "OpenClaw 中文技能调优版",
    subtitle: "全能技能库，高效搞定各类场景",
    tone: "sky",
    icon: "zap" as IconName,
    points: ["收录优质中文技能，覆盖搜索、文档处理、数据分析等高频领域", "多引擎一键搜索，适配国内外信息获取场景", "低配机可按需加载轻量技能，减少资源占用"],
  },
  {
    title: "Hermes Agent 中文调优版",
    subtitle: "自我进化的数字同事，越用越聪明",
    tone: "violet",
    icon: "bot" as IconName,
    points: ["支持主流 AI 模型切换，兼容本地与远程部署模式", "可接入企业微信等通讯平台，持续响应业务消息", "自动沉淀使用经验，复杂工作流可拆分协同处理"],
  },
];

const serviceAdvantages = [
  { title: "即插即用 · 零门槛上手", icon: "plug" as IconName, tone: "blue", text: "内置运行时和控制入口，无需目标电脑预装 Node/Python，双击即可启动本地 AI 能力。" },
  { title: "100万Tokens · 免费赠送", icon: "disk" as IconName, tone: "orange", text: "购机即送基础算力配额，适合上手测试、办公体验和轻量业务验证。" },
  { title: "便携小巧 · 全场景随身", icon: "globe" as IconName, tone: "emerald", text: "围绕 U 盘交付设计，办公、出差、演示和跨机器部署都可以保持统一入口。" },
];

const serviceScenarios = [
  { title: "一人公司/个人创业", text: "全能 AI 助手覆盖调研、文案、客服和运营，降低启动成本。" },
  { title: "电商行业", text: "商品文案、客服回复、数据整理和多平台素材生成更顺手。" },
  { title: "医疗/教育行业", text: "教案生成、资料整理、知识科普和结构化信息处理更高效。" },
  { title: "企服知产", text: "专利检索、商标资料、客户服务和文档流程自动化。" },
  { title: "财务审计", text: "报表整理、数据核对、风险筛查和审计材料初稿辅助。" },
  { title: "法律服务", text: "合同审查、法律文书、合规咨询和案例资料整理。" },
  { title: "工程招投标", text: "标书撰写、资质梳理、项目分析和材料汇总。" },
  { title: "生产制造", text: "设备运维、流程优化、质检记录和生产数据分析。" },
  { title: "企业办公", text: "公文撰写、会议纪要、知识库检索和日常办公自动化。" },
];

const serviceValueServices = [
  "OpenClaw教学实训一体机",
  "全系列培训服务",
  "DigiTeam企业级数字员工平台",
  "数字团队行业定制版",
  "专属技能定制开发",
  "AI应用深度定制开发",
  "融云API大模型调用服务",
  "大模型一体机定制",
  "全行业垂直AI解决方案",
];

const serviceIndustries = ["工程", "制造", "法律", "知产", "金融", "电力", "能源", "交通", "教育", "医疗", "文化传媒", "文旅", "政务", "科研", "党务"];

const serviceFaqs = [
  { title: "目标电脑需要预装环境吗？", text: "不需要。交付包内置便携 Node/Python 运行时，控制台会从当前 U 盘根目录解析路径。" },
  { title: "能替换或追加技能吗？", text: "可以。把技能放到根目录 skills 文件夹，OpenClaw 启动时会加载该目录，且不会重复追加同一路径。" },
  { title: "换 U 盘后还能用吗？", text: "从未绑定母包复制到新 U 盘即可；首次启动会写入当前设备绑定信息。" },
];

const activeTab = ref("console");
const services = ref<ServiceStatus[]>([]);
const skillsPayload = ref<SkillsPayload>({ root: "", skillsDir: "", exists: false, total: 0, deduplicated: false, skills: [] });
const deviceBinding = ref<DeviceBindingStatus | null>(null);
const logs = ref<string[]>([]);
const channelLogs = ref<string[]>([]);
const weixinChannel = ref<ChannelLoginStatus>({});
const busy = ref(false);
const channelBusy = ref(false);
const closing = ref(false);
const workspaceRef = ref<HTMLElement | null>(null);
const bootstrap = reactive<BootstrapPayload>({ root: "", controlUrl: "" });
const model = reactive<ModelConfig>({ apiUrl: "", model: "", apiKey: "" });
const selectedProviderId = ref("custom");
const serviceParticles = ref<HTMLCanvasElement | null>(null);
let timer: number | undefined;
let particleFrame: number | undefined;
let particleResizeHandler: (() => void) | undefined;

function requestFromBun(name: string, payload: unknown = {}) {
  const requests = electrobun.rpc?.request as Record<string, (params: unknown) => Promise<unknown>> | undefined;
  if (!requests?.[name]) throw new Error(`Electrobun RPC is unavailable: ${name}`);
  return requests[name](payload);
}

const summary = computed(() => {
  const ready = services.value.filter((service) => service.health?.ready).length;
  const running = services.value.filter((service) => service.status === "running").length;
  return { total: services.value.length, ready, running };
});

const featuredMetrics = computed(() => [
  { label: "服务总数", value: summary.value.total, icon: "stack" as IconName, tone: "violet" },
  { label: "已就绪", value: summary.value.ready, icon: "check" as IconName, tone: "emerald" },
  { label: "运行中", value: summary.value.running, icon: "pulse" as IconName, tone: "amber" },
]);

async function refresh() {
  const payload = (await requestFromBun("getStatus")) as StatusPayload;
  services.value = payload.services ?? [];
}

async function refreshLogs() {
  const payload = (await requestFromBun("getLogs")) as LogPayload;
  logs.value = payload.lines ?? [];
}

async function refreshSkills() {
  skillsPayload.value = (await requestFromBun("getSkills")) as SkillsPayload;
}

async function refreshDeviceBinding() {
  deviceBinding.value = (await requestFromBun("getDeviceBinding")) as DeviceBindingStatus;
}

async function bindCurrentDevice() {
  busy.value = true;
  try {
    deviceBinding.value = (await requestFromBun("bindDevice")) as DeviceBindingStatus;
  } finally {
    busy.value = false;
  }
}

async function refreshWeixinChannel() {
  weixinChannel.value = (await requestFromBun("getWeixinChannelStatus")) as ChannelLoginStatus;
}

async function refreshWeixinChannelLogs() {
  const payload = (await requestFromBun("getWeixinChannelLogs")) as LogPayload;
  channelLogs.value = payload.lines ?? [];
}

async function loadModelConfig() {
  const payload = (await requestFromBun("getModelConfig")) as { config?: ModelConfig };
  model.apiUrl = payload.config?.apiUrl ?? "";
  model.model = payload.config?.model ?? "";
  syncSelectedProvider();
}

async function runAction(action: "startAll" | "stopAll") {
  busy.value = true;
  try {
    await requestFromBun(action);
    await refresh();
    await refreshDeviceBinding();
    await refreshLogs();
  } finally {
    busy.value = false;
  }
}

async function saveModel() {
  busy.value = true;
  try {
    await requestFromBun("saveModelConfig", { ...model });
    await loadModelConfig();
    await refreshLogs();
  } finally {
    busy.value = false;
  }
}

async function startWeixinLogin() {
  channelBusy.value = true;
  try {
    weixinChannel.value = (await requestFromBun("startWeixinChannelLogin")) as ChannelLoginStatus;
    await refreshWeixinChannelLogs();
  } finally {
    channelBusy.value = false;
  }
}

async function stopWeixinLogin() {
  channelBusy.value = true;
  try {
    weixinChannel.value = (await requestFromBun("stopWeixinChannelLogin")) as ChannelLoginStatus;
    await refreshWeixinChannelLogs();
  } finally {
    channelBusy.value = false;
  }
}

function selectProvider(provider: ProviderPreset) {
  selectedProviderId.value = provider.id;
  model.apiUrl = provider.baseUrl;
  model.model = provider.model;
}

function scrollServiceSection(sectionId: string) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  const scroller = workspaceRef.value;
  if (!scroller) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 96;
  scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function syncSelectedProvider() {
  const matched = providerPresets.find((provider) => provider.baseUrl && provider.baseUrl === model.apiUrl);
  selectedProviderId.value = matched?.id ?? "custom";
}

function selectedProvider() {
  return providerPresets.find((provider) => provider.id === selectedProviderId.value) ?? providerPresets[providerPresets.length - 1];
}

function openProviderKeyPage() {
  const url = selectedProvider().keyUrl;
  if (url) requestFromBun("openUrl", { url });
}

function openContact() {
  requestFromBun("openUrl", { url: "https://work.weixin.qq.com/kfid/kfcd0aac5881ee8d453" });
}

function openDtSite() {
  requestFromBun("openUrl", { url: "https://digiteam.cn/" });
}

function openClawHub() {
  requestFromBun("openUrl", { url: "https://cn.clawhub-mirror.com/" });
}

function openWeixinDocs() {
  requestFromBun("openUrl", { url: "https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin" });
}

function openService(service: ServiceStatus) {
  if (!service.portalUrl) return;
  requestFromBun("openUrl", { url: service.portalUrl });
}

function serviceIcon(service: ServiceStatus): IconName {
  const id = (service.id || "").toLowerCase();
  if (id.includes("openclaw")) return "zap";
  if (id.includes("agent")) return "bot";
  if (id.includes("web")) return "globe";
  if (id.includes("portal")) return "panel";
  return "service";
}

function serviceTone(service: ServiceStatus): string {
  const id = (service.id || "").toLowerCase();
  if (id.includes("openclaw")) return "orange";
  if (id.includes("agent")) return "violet";
  if (id.includes("web")) return "sky";
  if (id.includes("portal")) return "emerald";
  return "slate";
}

function providerTone(provider: string): string {
  const tones = ["sky", "violet", "emerald", "amber", "rose", "cyan", "blue", "orange"];
  let code = 0;
  for (const char of provider) code += char.charCodeAt(0);
  return tones[code % tones.length];
}

function healthLabel(service: ServiceStatus) {
  return service.health?.ready ? "ready" : service.health?.reason || "not ready";
}

function statusClass(service: ServiceStatus) {
  if (service.health?.ready) return "ready";
  if (service.status === "running") return "warning";
  if (service.status === "stopped") return "stopped";
  return "warning";
}

function statusLabel(service: ServiceStatus) {
  if (service.status === "placeholder-started") return "placeholder";
  return service.status || "unknown";
}

function skillTone(skill: PortableSkill): string {
  return providerTone(skill.name);
}

function skillInitial(skill: PortableSkill): string {
  return (skill.name || "S").slice(0, 1).toUpperCase();
}

function bindingLabel(state: DeviceBindingStatus["state"] | undefined) {
  if (state === "bound") return "已绑定";
  if (state === "mismatch") return "绑定异常";
  return "未绑定";
}

function bindingTone(state: DeviceBindingStatus["state"] | undefined) {
  if (state === "bound") return "ready";
  if (state === "mismatch") return "stopped";
  return "warning";
}

function channelStatusLabel(status?: string) {
  if (status === "missing-plugin") return "准备中";
  if (status === "running") return "登录中";
  if (status === "started") return "已启动";
  if (status === "stopped") return "待登录";
  return "未知";
}

function channelStatusClass(status?: string) {
  if (status === "missing-plugin") return "warning";
  if (status === "running" || status === "started") return "ready";
  return "stopped";
}

function serviceTitle(service: ServiceStatus) {
  const id = (service.id || service.displayName || "").toLowerCase();
  if (id.includes("hermes-agent") || id.includes("hermes agent") || id.includes("agent")) return "Hermes Agent";
  if (id.includes("hermes-web-ui") || id.includes("hermes web ui") || id.includes("web")) return "Hermes Web UI";
  if (id.includes("openclaw")) return "OpenClaw";
  if (id.includes("portal")) return "Portal";
  return service.displayName || service.id || "Service";
}

function serviceSubtitle(service: ServiceStatus) {
  const id = (service.id || "").toLowerCase();
  if (id.includes("agent")) return "Hermes 后端代理";
  if (id.includes("web")) return "Hermes Web 界面";
  if (id.includes("openclaw")) return "OpenClaw Gateway";
  if (id.includes("portal")) return "本地入口 Portal";
  return service.id || "";
}

async function minimizeWindow() {
  await requestFromBun("minimizeWindow");
}

async function maximizeWindow() {
  await requestFromBun("maximizeWindow");
}

async function closeWindow() {
  if (closing.value) return;
  closing.value = true;
  busy.value = true;
  requestFromBun("closeWindow").catch((error) => {
    console.error("close window failed", error);
  });
}

async function shutdown() {
  await requestFromBun("shutdown");
}

function initServiceParticles() {
  stopServiceParticles();
  const canvas = serviceParticles.value;
  const parent = canvas?.parentElement;
  if (!canvas || !parent) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const particles = Array.from({ length: 58 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.00055,
    vy: (Math.random() - 0.5) * 0.00055,
  }));

  const resize = () => {
    const rect = parent.getBoundingClientRect();
    const scale = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
  };

  const draw = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    context.clearRect(0, 0, width, height);

    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < 0 || particle.x > 1) particle.vx *= -1;
      if (particle.y < 0 || particle.y > 1) particle.vy *= -1;
    });

    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const a = particles[i];
        const b = particles[j];
        const ax = a.x * width;
        const ay = a.y * height;
        const bx = b.x * width;
        const by = b.y * height;
        const distance = Math.hypot(ax - bx, ay - by);
        if (distance > 145) continue;
        context.strokeStyle = `rgba(255,255,255,${0.28 * (1 - distance / 145)})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
      }
    }

    particles.forEach((particle) => {
      context.fillStyle = "rgba(255,255,255,0.62)";
      context.beginPath();
      context.arc(particle.x * width, particle.y * height, 2, 0, Math.PI * 2);
      context.fill();
    });

    particleFrame = window.requestAnimationFrame(draw);
  };

  resize();
  particleResizeHandler = resize;
  window.addEventListener("resize", resize);
  particleFrame = window.requestAnimationFrame(draw);
}

function stopServiceParticles() {
  if (particleFrame) window.cancelAnimationFrame(particleFrame);
  particleFrame = undefined;
  if (particleResizeHandler) window.removeEventListener("resize", particleResizeHandler);
  particleResizeHandler = undefined;
}

onMounted(async () => {
  try {
    const data = (await requestFromBun("getBootstrap")) as BootstrapPayload;
    bootstrap.root = data.root;
    bootstrap.controlUrl = data.controlUrl;
  } catch (error) {
    console.error("bootstrap failed", error);
  }
  await Promise.allSettled([refresh(), refreshSkills(), refreshDeviceBinding(), refreshLogs(), loadModelConfig(), refreshWeixinChannel(), refreshWeixinChannelLogs()]);
  timer = window.setInterval(() => {
    refresh().catch((error) => console.error("status refresh failed", error));
  }, 1500);
});

watch(activeTab, async (tab) => {
  if (tab === "channels") {
    await Promise.all([refreshWeixinChannel(), refreshWeixinChannelLogs()]);
  }
  if (tab === "skills") {
    await refreshSkills();
  }
  if (tab === "settings") {
    await refreshDeviceBinding();
  }
  if (tab !== "services") {
    stopServiceParticles();
    return;
  }
  await nextTick();
  initServiceParticles();
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
  stopServiceParticles();
});
</script>

<template>
  <main class="app-shell">
    <header class="window-bar electrobun-webkit-app-region-drag">
      <div class="window-controls electrobun-webkit-app-region-no-drag" aria-label="窗口控制">
        <button class="traffic close" title="关闭" @click="closeWindow" />
        <button class="traffic minimize" title="最小化" @click="minimizeWindow" />
        <button class="traffic zoom" title="最大化/还原" @click="maximizeWindow" />
      </div>
      <div class="window-title">
        <span class="title-orb" />
        <span>DTclaw Control</span>
      </div>
    </header>

    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <img :src="dtclawLogo" alt="DTclaw" />
        </div>
        <div>
          <h1>DTclaw</h1>
          <span>Portable Control</span>
        </div>
      </div>

      <nav class="nav-list">
        <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
          <span class="nav-icon color-icon" :class="tab.tone">
            <IconGlyph :name="tab.icon" />
          </span>
          <span class="nav-label">{{ tab.label }}</span>
        </button>
      </nav>

      <div class="side-note">
        <span class="side-icon">
          <IconGlyph name="check" />
        </span>
        <div>
          <strong>{{ summary.ready }}/{{ summary.total }}</strong>
          <span>服务就绪</span>
        </div>
      </div>
    </aside>

    <section ref="workspaceRef" class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">OpenClaw · Hermes · Web UI</p>
          <h2>本地控制台</h2>
          <span>{{ bootstrap.root || "正在连接控制服务..." }}</span>
        </div>
        <div class="top-actions">
          <button class="action-button primary" :disabled="busy || closing" @click="runAction('startAll')">
            <span class="action-icon"><IconGlyph name="play" /></span>
            <span class="action-label">启动</span>
          </button>
          <button class="action-button danger" :disabled="busy || closing" @click="runAction('stopAll')">
            <span class="action-icon"><IconGlyph name="stop" /></span>
            <span class="action-label">停止</span>
          </button>
          <button class="action-button ghost" :disabled="closing" @click="refresh">
            <span class="action-icon"><IconGlyph name="refresh" /></span>
            <span class="action-label">{{ closing ? "关闭中" : "刷新" }}</span>
          </button>
        </div>
      </header>

      <section v-if="activeTab === 'console'" class="page-grid">
        <div v-for="metric in featuredMetrics" :key="metric.label" class="metric-card" :class="metric.tone">
          <span class="metric-icon color-icon" :class="metric.tone">
            <IconGlyph :name="metric.icon" />
          </span>
          <div>
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </div>
        </div>

        <article v-for="service in services" :key="service.id" class="service-card">
          <div class="service-head">
            <div>
              <span class="service-icon color-icon" :class="[statusClass(service), serviceTone(service)]">
                <IconGlyph :name="serviceIcon(service)" />
              </span>
              <div>
                <strong class="service-name">{{ serviceTitle(service) }}</strong>
                <span class="service-subtitle">{{ serviceSubtitle(service) }}</span>
                <p>{{ healthLabel(service) }}</p>
              </div>
            </div>
            <span class="pill" :class="statusClass(service)" :title="service.status">{{ statusLabel(service) }}</span>
          </div>
          <button class="link-button" :disabled="!service.portalUrl" @click="openService(service)">打开 Web</button>
        </article>
      </section>

      <section v-if="activeTab === 'models'" class="models-page">
        <div class="panel">
          <h3>模型服务商</h3>
          <div class="provider-grid">
            <button
              v-for="provider in providerPresets"
              :key="provider.id"
              type="button"
              class="provider-card"
              :class="[provider.tone, { active: selectedProviderId === provider.id }]"
              @click="selectProvider(provider)"
            >
              <span class="provider-icon">{{ provider.short }}</span>
              <strong>{{ provider.label }}</strong>
              <span class="provider-model">{{ provider.model || "手动填写" }}</span>
              <span class="provider-tags">
                <span v-for="tag in provider.tags" :key="tag">{{ tag }}</span>
              </span>
            </button>
          </div>
        </div>
        <form class="panel config-form" @submit.prevent="saveModel">
          <h3>当前配置</h3>
          <div class="selected-provider">
            <span class="provider-icon" :class="selectedProvider().tone">{{ selectedProvider().short }}</span>
            <div>
              <strong>{{ selectedProvider().label }}</strong>
              <span>选择融云API会填入官方 Base URL；模型名称和 API Key 由使用者自行配置，保存后写入 OpenClaw 与 Hermes 配置。</span>
            </div>
          </div>
          <input v-model="model.apiUrl" placeholder="API URL / Base URL" />
          <input v-model="model.model" placeholder="Model" />
          <input v-model="model.apiKey" placeholder="API Key" type="password" />
          <button v-if="selectedProvider().keyUrl" class="ghost key-link" type="button" @click="openProviderKeyPage">获取 API Key</button>
          <button class="primary" :disabled="busy">保存模型</button>
        </form>
      </section>

      <section v-if="activeTab === 'channels'" class="channels-page">
        <div class="panel channel-intro">
          <div>
            <p class="eyebrow">OpenClaw Channels</p>
            <h3>渠道接入</h3>
            <p>微信官方插件已随交付包内置，用户只需要扫码登录即可接入微信，无需额外配置 AppID/Secret。</p>
          </div>
          <button class="ghost" type="button" :disabled="channelBusy" @click="refreshWeixinChannelLogs">刷新日志</button>
        </div>

        <article class="channel-card featured">
          <div class="channel-head">
            <span class="channel-icon color-icon emerald">
              <IconGlyph name="bot" />
            </span>
            <div>
              <strong>微信（官方插件）</strong>
              <span>交付包内置微信官方插件，扫码登录即可接入微信。</span>
            </div>
            <span class="pill" :class="channelStatusClass(weixinChannel.status)">
              {{ channelStatusLabel(weixinChannel.status) }}
            </span>
          </div>
          <div class="channel-steps">
            <span>1. 点击扫码登录，查看下方日志中的二维码输出</span>
            <span>2. 手机扫码授权后重启 OpenClaw</span>
            <span>3. 微信渠道上线后即可接收消息</span>
          </div>
          <div class="channel-actions">
            <button class="primary" type="button" :disabled="channelBusy || weixinChannel.status === 'missing-plugin'" @click="startWeixinLogin">微信扫码登录</button>
            <button class="danger" type="button" :disabled="channelBusy || weixinChannel.status !== 'running'" @click="stopWeixinLogin">停止登录</button>
            <button class="ghost" type="button" @click="openWeixinDocs">插件文档</button>
          </div>
          <p v-for="message in weixinChannel.status === 'missing-plugin' ? [] : (weixinChannel.messages || [])" :key="message" class="channel-message">{{ message }}</p>
        </article>

        <section class="panel channel-log">
          <div class="panel-head">
            <h3>微信登录日志</h3>
            <button class="ghost" type="button" :disabled="channelBusy" @click="refreshWeixinChannelLogs">刷新</button>
          </div>
          <pre>{{ channelLogs.join("\n") || "暂无微信登录日志。点击微信扫码登录后，这里会显示 OpenClaw 输出。" }}</pre>
        </section>
      </section>

      <section v-if="activeTab === 'skills'" class="skills-page">
        <div class="panel skills-hero">
          <div>
            <p class="eyebrow">OpenClaw Skills</p>
            <h3>技能中心</h3>
            <p>技能包独立存放在交付目录的 skills 文件夹，OpenClaw 启动时会自动加载该目录，后续替换 OpenClaw payload 不会覆盖这里。</p>
            <code>{{ skillsPayload.skillsDir || bootstrap.root + "\\skills" }}</code>
          </div>
          <button class="ghost" type="button" @click="refreshSkills">刷新技能</button>
        </div>

        <article class="panel skill-market-card">
          <div class="skill-market-copy">
            <span class="skill-market-icon color-icon orange">
              <IconGlyph name="spark" />
            </span>
            <div>
              <p class="eyebrow">ClawHub Skill Market</p>
              <h3>ClawHub镜像站</h3>
              <p>ClawHub 镜像站提供 6万+ Agent Skill 仓库，用户可以在线浏览、搜索和获取更多可复用技能，再按需放入本地交付目录的 skills 文件夹。</p>
            </div>
          </div>
          <div class="skill-market-actions">
            <strong>6万+ Agent Skill</strong>
            <button class="primary" type="button" @click="openClawHub">访问技能站</button>
            <code>https://cn.clawhub-mirror.com/</code>
          </div>
        </article>

        <div class="skill-stats">
          <article class="metric-card cyan">
            <span class="metric-icon color-icon cyan">
              <IconGlyph name="spark" />
            </span>
            <div>
              <span>已加载技能</span>
              <strong>{{ skillsPayload.total }}</strong>
            </div>
          </article>
          <article class="metric-card emerald">
            <span class="metric-icon color-icon emerald">
              <IconGlyph name="check" />
            </span>
            <div>
              <span>去重状态</span>
              <strong>{{ skillsPayload.deduplicated ? "已去重" : "正常" }}</strong>
            </div>
          </article>
          <article class="metric-card orange">
            <span class="metric-icon color-icon orange">
              <IconGlyph name="globe" />
            </span>
            <div>
              <span>技能站规模</span>
              <strong>6万+</strong>
            </div>
          </article>
        </div>

        <div v-if="skillsPayload.skills.length" class="skills-grid">
          <article v-for="skill in skillsPayload.skills" :key="skill.name" class="skill-card">
            <div class="skill-card-head">
              <span class="skill-icon color-icon" :class="skillTone(skill)">{{ skillInitial(skill) }}</span>
              <div>
                <strong>{{ skill.name }}</strong>
                <span>{{ skill.source === "portable" ? "交付技能包" : skill.source }}</span>
              </div>
              <span v-if="skill.duplicateCount > 0" class="pill warning">去重 {{ skill.duplicateCount }}</span>
            </div>
            <p>{{ skill.description }}</p>
            <code>{{ skill.relativePath }}</code>
          </article>
        </div>

        <div v-else class="panel empty-skills">
          <span class="empty-icon color-icon cyan">
            <IconGlyph name="spark" />
          </span>
          <div>
            <h3>暂无技能</h3>
            <p>把技能包放到交付目录的 skills 文件夹后，点击刷新即可看到；启动 OpenClaw 时会自动加载这个目录。</p>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'services'" class="services-page">
        <nav class="service-nav">
          <div class="service-brand">
            <strong>DTClaw</strong>
            <span>双核版</span>
          </div>
          <div class="service-nav-links">
            <button type="button" @click="scrollServiceSection('service-overview')">产品概述</button>
            <button type="button" @click="scrollServiceSection('service-core')">核心功能</button>
            <button type="button" @click="scrollServiceSection('service-advantages')">产品优势</button>
            <button type="button" @click="scrollServiceSection('service-scenarios')">应用场景</button>
            <button type="button" @click="scrollServiceSection('service-setup')">快速启动</button>
            <button type="button" @click="scrollServiceSection('service-faq')">常见问题</button>
            <button type="button" @click="scrollServiceSection('service-value')">增值服务</button>
          </div>
        </nav>

        <section class="service-hero">
          <canvas ref="serviceParticles" class="service-particles" aria-hidden="true" />
          <div class="service-hero-copy">
            <h3>DTClaw 即插即用<br />龙虾双核版</h3>
            <p>内置 OpenClaw 技能调优中文版和 Hermes 爱马仕智能体中文版，插入 U 盘即可从本地控制台启动、配置和管理。</p>
            <div class="service-hero-actions">
              <button class="dt-primary" type="button" @click="openContact">联系客服获取更多支持</button>
              <button class="dt-outline" type="button" @click="openDtSite">进入官网即可立即升级企业级数字员工</button>
            </div>
            <p class="service-hero-note">注：此图片为参考图收到的产品批次不同款式不同</p>
            <div class="service-token-line">
              <span>100万</span>
              <span>免费</span>
              <span>Tokens</span>
              <strong>赠送100万Tokens</strong>
            </div>
          </div>
          <div class="service-product-wrap">
            <div class="service-product-glow" />
            <img :src="product12Image" alt="DTClaw U盘即插即用龙虾双核版" />
          </div>
        </section>

        <section id="service-overview" class="service-landing-section overview">
          <div class="service-section-heading">
            <span>Product Overview</span>
            <h3>产品概述</h3>
            <p>无需复杂安装，无需专业配置，插上 U 盘双击启动。DTClaw 即插即用龙虾双核版将 OpenClaw 与 Hermes Agent 收束到统一控制入口。</p>
          </div>
          <div class="service-overview-grid">
            <article>
              <span class="color-icon blue"><IconGlyph name="zap" /></span>
              <div>
                <h4>双核驱动 · 中文调优</h4>
                <p>内置 OpenClaw 中文技能调优版与 Hermes Agent 中文调优版，减少语言壁垒和本地适配成本。</p>
              </div>
            </article>
            <article>
              <span class="color-icon emerald"><IconGlyph name="check" /></span>
              <div>
                <h4>便携交付 · 本地管理</h4>
                <p>启动、停止、模型配置、Web UI、日志和技能包都通过本地控制台管理，适合 U 盘交付和跨机器使用。</p>
              </div>
            </article>
            <article>
              <span class="color-icon orange"><IconGlyph name="disk" /></span>
              <div>
                <h4>赠送100万Tokens</h4>
                <p>基础算力配额适合上手体验、业务验证和轻量办公，让用户更快进入真实使用场景。</p>
              </div>
            </article>
          </div>
        </section>

        <section id="service-core" class="service-landing-section muted">
          <div class="service-section-heading">
            <span>Core Capabilities</span>
            <h3>核心功能</h3>
            <p>双核能力围绕技能调用和智能体协作展开，控制台负责把启动、配置和状态检测变成统一入口。</p>
          </div>
          <div class="service-feature-grid">
            <article v-for="card in serviceFeatureCards" :key="card.title" class="service-feature-card">
              <div class="service-feature-visual" :class="card.tone">
                <IconGlyph :name="card.icon" />
              </div>
              <div class="service-feature-body">
                <h4>{{ card.title }}</h4>
                <p>{{ card.subtitle }}</p>
                <ul>
                  <li v-for="point in card.points" :key="point">
                    <IconGlyph name="check" />
                    <span>{{ point }}</span>
                  </li>
                </ul>
              </div>
            </article>
          </div>
        </section>

        <section id="service-advantages" class="service-landing-section">
          <div class="service-section-heading">
            <span>Advantages</span>
            <h3>产品优势</h3>
            <p>围绕零门槛上手、可复制交付和随身便携进行设计，减少部署和使用阻力。</p>
          </div>
          <div class="service-info-grid">
            <article v-for="item in serviceAdvantages" :key="item.title">
              <span class="service-info-icon color-icon" :class="item.tone">
                <IconGlyph :name="item.icon" />
              </span>
              <h4>{{ item.title }}</h4>
              <p>{{ item.text }}</p>
            </article>
          </div>
        </section>

        <section id="service-scenarios" class="service-landing-section muted">
          <div class="service-section-heading">
            <span>Scenarios</span>
            <h3>应用场景</h3>
            <p>覆盖个人创业、电商、医疗教育、企服知产、财务审计、法律服务、工程投标、生产制造和企业办公等高频场景。</p>
          </div>
          <div class="service-scenario-grid">
            <article v-for="(scenario, index) in serviceScenarios" :key="scenario.title">
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              <h4>{{ scenario.title }}</h4>
              <p>{{ scenario.text }}</p>
            </article>
          </div>
        </section>

        <section id="service-value" class="service-landing-section service-value-band">
          <div class="service-section-heading light">
            <span>Enterprise Upgrade</span>
            <h3>增值服务</h3>
            <p>不只是 OpenClaw，我们提供更具落地价值的企业级数字员工：全栈 AI 增值服务、数字员工定制、行业解决方案和全周期落地护航。</p>
          </div>
          <div class="service-standard-grid">
            <article>
              <IconGlyph name="globe" />
              <h4>基础标配服务</h4>
              <p>OpenClaw 官方交流社群、基础操作指导、常见故障排查和版本信息同步。</p>
            </article>
            <article>
              <IconGlyph name="service" />
              <h4>技术支持护航</h4>
              <p>围绕模型配置、账号权限、插件接入和日常使用问题提供基础支持。</p>
            </article>
          </div>
          <div class="service-section-heading compact light">
            <span>Service Upgrade</span>
            <h3>9大核心增值服务 · 覆盖企业AI全场景</h3>
          </div>
          <div class="service-value-grid">
            <article v-for="(item, index) in serviceValueServices" :key="item" :class="{ highlight: index === serviceValueServices.length - 1 }">
              <span>{{ index + 1 }}</span>
              <strong>{{ item }}</strong>
            </article>
          </div>
          <div class="service-solution-band">
            <h4>全行业垂直AI解决方案</h4>
            <p>垂直行业深度定制 · 直击业务痛点 · 落地即增效</p>
            <div>
              <span v-for="industry in serviceIndustries" :key="industry">{{ industry }}</span>
            </div>
          </div>
        </section>

        <section id="service-setup" class="service-landing-section">
          <div class="service-section-heading">
            <span>Quick Start</span>
            <h3>快速启动</h3>
            <p>插入 U 盘后运行控制入口，选择模型服务商并填写 API Key，再返回控制台点击启动即可开始使用。</p>
          </div>
          <div class="service-step-row">
            <article>
              <span>01</span>
              <h4>打开控制台</h4>
              <p>双击根目录的 Electrobun 控制入口，等待本地 control-server 就绪。</p>
            </article>
            <article>
              <span>02</span>
              <h4>配置模型</h4>
              <p>选择融云API或自定义模型，填写 Base URL、模型名称和 API Key。</p>
            </article>
            <article>
              <span>03</span>
              <h4>启动服务</h4>
              <p>返回控制台点击启动，状态变为 ready 后即可打开 Web 界面。</p>
            </article>
          </div>
        </section>

        <section id="service-faq" class="service-landing-section muted">
          <div class="service-section-heading">
            <span>FAQ</span>
            <h3>常见问题</h3>
          </div>
          <div class="service-faq-list">
            <article v-for="faq in serviceFaqs" :key="faq.title">
              <h4>{{ faq.title }}</h4>
              <p>{{ faq.text }}</p>
            </article>
          </div>
        </section>
      </section>

      <section v-if="activeTab === 'logs'" class="panel logs-page">
        <div class="panel-head">
          <h3>运行日志</h3>
          <button class="ghost" @click="refreshLogs">刷新日志</button>
        </div>
        <pre>{{ logs.join("\n") || "暂无日志" }}</pre>
      </section>

      <section v-if="activeTab === 'settings'" class="panel settings-page">
        <h3>设置</h3>
        <label>USB root</label>
        <code>{{ bootstrap.root }}</code>
        <label>Control server</label>
        <code>{{ bootstrap.controlUrl }}</code>
        <div class="binding-card">
          <div>
            <span class="eyebrow">USB Device Binding</span>
            <h4>U 盘绑定</h4>
            <p>{{ deviceBinding?.messages?.[0] || "首次启动服务时会自动绑定当前 U 盘。" }}</p>
          </div>
          <span class="pill" :class="bindingTone(deviceBinding?.state)">{{ bindingLabel(deviceBinding?.state) }}</span>
        </div>
        <label>Binding file</label>
        <code>{{ deviceBinding?.bindingPath || "data/settings/device-binding.json" }}</code>
        <label>Current fingerprint</label>
        <code>{{ deviceBinding?.current?.summary || "等待检测" }}</code>
        <button class="ghost" :disabled="busy || deviceBinding?.state === 'bound'" @click="bindCurrentDevice">绑定当前 U 盘</button>
        <button class="ghost" @click="refreshDeviceBinding">刷新绑定状态</button>
        <button class="danger" @click="shutdown">停止并关闭控制服务</button>
      </section>
    </section>
  </main>
</template>
