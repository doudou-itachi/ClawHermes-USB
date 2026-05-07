<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Electroview } from "electrobun/view";
import type { BootstrapPayload, LogPayload, ModelConfig, ServiceStatus, StatusPayload } from "../shared/types";
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
  | "maximize";

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
  { id: "deepseek", label: "DeepSeek", short: "D", tone: "blue", tags: ["国内", "OpenAI 兼容"], baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", keyUrl: "https://platform.deepseek.com/" },
  { id: "minimax", label: "MiniMax", short: "M", tone: "amber", tags: ["国内", "推荐"], baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-Text-01", keyUrl: "https://platform.minimaxi.com/" },
  { id: "kimi", label: "Kimi", short: "K", tone: "emerald", tags: ["国内", "Moonshot"], baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-auto", keyUrl: "https://platform.moonshot.cn/" },
  { id: "qwen", label: "通义千问", short: "通", tone: "rose", tags: ["国内", "阿里云"], baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo", keyUrl: "https://dashscope.console.aliyun.com/" },
  { id: "doubao", label: "豆包", short: "豆", tone: "orange", tags: ["国内", "火山方舟"], baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-1.5-pro-32k", keyUrl: "https://console.volcengine.com/ark" },
  { id: "siliconflow", label: "硅基流动", short: "硅", tone: "cyan", tags: ["国内", "低成本"], baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-72B-Instruct", keyUrl: "https://cloud.siliconflow.cn/" },
  { id: "zhipu", label: "智谱 GLM", short: "智", tone: "orange", tags: ["国内", "GLM"], baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-plus", keyUrl: "https://open.bigmodel.cn/" },
  { id: "openai", label: "OpenAI", short: "O", tone: "rose", tags: ["海外", "OpenAI"], baseUrl: "https://api.openai.com/v1", model: "gpt-4o", keyUrl: "https://platform.openai.com/" },
  { id: "anthropic", label: "Claude", short: "C", tone: "blue", tags: ["海外", "Anthropic"], baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514", keyUrl: "https://console.anthropic.com/" },
  { id: "groq", label: "Groq", short: "G", tone: "violet", tags: ["海外", "高速"], baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keyUrl: "https://console.groq.com/" },
  { id: "custom", label: "自定义", short: "自", tone: "cyan", tags: ["兼容", "手动填写"], baseUrl: "", model: "" },
];

const activeTab = ref("console");
const services = ref<ServiceStatus[]>([]);
const logs = ref<string[]>([]);
const busy = ref(false);
const closing = ref(false);
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
    await refreshLogs();
  } finally {
    busy.value = false;
  }
}

async function useNow() {
  activeTab.value = "console";
  await runAction("startAll");
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

function selectProvider(provider: ProviderPreset) {
  selectedProviderId.value = provider.id;
  if (provider.id !== "custom") {
    model.apiUrl = provider.baseUrl;
    model.model = provider.model;
  }
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
  const data = (await requestFromBun("getBootstrap")) as BootstrapPayload;
  bootstrap.root = data.root;
  bootstrap.controlUrl = data.controlUrl;
  await Promise.all([refresh(), refreshLogs(), loadModelConfig()]);
  timer = window.setInterval(refresh, 1500);
});

watch(activeTab, async (tab) => {
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
        <span>ClawHermes Control</span>
      </div>
    </header>

    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <IconGlyph name="service" />
        </div>
        <div>
          <h1>ClawHermes</h1>
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

    <section class="workspace">
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
              <span>选择服务商会填入默认 Base URL 和模型，保存后写入 OpenClaw 与 Hermes 配置。</span>
            </div>
          </div>
          <input v-model="model.apiUrl" placeholder="API URL / Base URL" />
          <input v-model="model.model" placeholder="Model" />
          <input v-model="model.apiKey" placeholder="API Key" type="password" />
          <button v-if="selectedProvider().keyUrl" class="ghost key-link" type="button" @click="openProviderKeyPage">获取 API Key</button>
          <button class="primary" :disabled="busy">保存模型</button>
        </form>
      </section>

      <section v-if="activeTab === 'services'" class="services-page">
        <nav class="service-nav">
          <div class="service-brand">
            <strong>DTClaw</strong>
            <span>双核版</span>
          </div>
          <div class="service-nav-links">
            <a href="#service-overview">产品概述</a>
            <a href="#service-core">核心功能</a>
            <a href="#service-setup">快速启动</a>
            <a href="#service-faq">常见问题</a>
          </div>
          <button class="service-nav-cta" type="button" @click="useNow">立即使用</button>
        </nav>

        <section class="service-hero">
          <canvas ref="serviceParticles" class="service-particles" aria-hidden="true" />
          <div class="service-hero-copy">
            <h3>DTClaw 即插即用<br />龙虾双核版</h3>
            <p>内置 OpenClaw 技能调优中文版和 Hermes 爱马仕智能体中文版，插入 U 盘即可从本地控制台启动、配置和管理。</p>
            <div class="service-hero-actions">
              <button class="dt-primary" type="button" @click="openContact">联系我们</button>
              <button class="dt-secondary" type="button" @click="useNow">立即使用</button>
              <button class="dt-outline" type="button" @click="openDtSite">DT 官网</button>
            </div>
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

        <section id="service-overview" class="service-info-grid">
          <article>
            <span>01</span>
            <h4>产品概述</h4>
            <p>把 OpenClaw 与 Hermes 的本地运行、模型配置、Web UI 和日志管理收束到一个便携式入口，适合 U 盘交付和跨机器使用。</p>
          </article>
          <article id="service-core">
            <span>02</span>
            <h4>核心功能</h4>
            <p>一键启动/停止服务、检测运行状态、配置模型供应商、打开 Web 界面，并在关闭窗口后自动释放相关服务占用。</p>
          </article>
          <article id="service-setup">
            <span>03</span>
            <h4>快速启动</h4>
            <p>插入 U 盘后运行控制入口，选择模型服务商并填写 API Key，再返回控制台点击启动即可开始使用。</p>
          </article>
          <article id="service-faq">
            <span>04</span>
            <h4>常见问题</h4>
            <p>无需目标电脑预装 Node/Python；当前交付包内置运行时和完整 OpenClaw、Hermes、Hermes Web UI payload。</p>
          </article>
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
        <button class="danger" @click="shutdown">停止并关闭控制服务</button>
      </section>
    </section>
  </main>
</template>
