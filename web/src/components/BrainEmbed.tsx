import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface BrainEmbedProps {
  type: string;
  params: Record<string, string>;
}

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const componentCache = new Map<string, CacheEntry>();

function getCacheKey(type: string, params: Record<string, string>): string {
  const sortedParams = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${type}:${JSON.stringify(sortedParams)}`;
}

function getCachedData(type: string, params: Record<string, string>): any | null {
  const key = getCacheKey(type, params);
  const entry = componentCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  if (entry) {
    componentCache.delete(key);
  }
  return null;
}

function setCachedData(type: string, params: Record<string, string>, data: any, expiresAt: string): void {
  const key = getCacheKey(type, params);
  const expires = new Date(expiresAt).getTime();
  componentCache.set(key, { data, expiresAt: expires });
}

function renderStock(data: any): string {
  const price = data.price ?? '-';
  const change = data.change ?? 0;
  const changePercent = data.changePercent ?? 0;
  const isUp = change >= 0;
  const arrow = isUp ? '↑' : '↓';
  const color = isUp ? '#22c55e' : '#ef4444';
  return `
    <div class="stock-content">
      <div class="stock-price">${price}</div>
      <div class="stock-change" style="color: ${color}">
        ${arrow} ${change > 0 ? '+' : ''}${change} (${changePercent > 0 ? '+' : ''}${changePercent}%)
      </div>
    </div>
  `;
}

function renderWeather(data: any): string {
  const icon = data.icon ?? '🌤️';
  const temp = data.temp ?? '-';
  const description = data.description ?? '';
  return `
    <div class="weather-content">
      <span class="weather-icon">${icon}</span>
      <div class="weather-info">
        <span class="weather-temp">${temp}</span>
        ${description ? `<span class="weather-desc">${description}</span>` : ''}
      </div>
    </div>
  `;
}

function renderRss(data: any): string {
  const items = data.items ?? [];
  if (!items.length) return '<div class="rss-empty">暂无内容</div>';
  return `
    <ul class="rss-list">
      ${items.map((item: any) => {
        const title = item.title ?? '';
        const link = item.link ?? '#';
        const date = item.date ? new Date(item.date).toLocaleDateString('zh-CN') : '';
        return `
          <li class="rss-item">
            <a href="${link}" target="_blank" rel="noopener noreferrer" class="rss-link">${title}</a>
            ${date ? `<span class="rss-date">${date}</span>` : ''}
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderCrypto(data: any): string {
  const price = data.price ?? '-';
  return `
    <div class="crypto-content">
      <span class="crypto-label">价格</span>
      <span class="crypto-price">${price}</span>
    </div>
  `;
}

function renderJson(data: any, jqFilter?: string): string {
  let displayData = data;
  if (jqFilter && typeof window !== 'undefined' && (window as any).jq) {
    try {
      displayData = (window as any).jq(data, jqFilter);
    } catch {
      displayData = data;
    }
  }
  const jsonStr = typeof displayData === 'string' ? displayData : JSON.stringify(displayData, null, 2);
  return `
    <pre class="json-content"><code>${jsonStr}</code></pre>
  `;
}

function renderContent(type: string, data: any, params: Record<string, string>): string {
  switch (type) {
    case 'stock':
      return renderStock(data);
    case 'weather':
      return renderWeather(data);
    case 'rss':
      return renderRss(data);
    case 'crypto':
      return renderCrypto(data);
    case 'json':
      return renderJson(data, params.jq_filter);
    default:
      return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  }
}

const SKEL_LOADING = `
  <div class="skeleton">
    <div class="skeleton-line"></div>
    <div class="skeleton-line"></div>
    <div class="skeleton-line"></div>
  </div>
`;

class BrainEmbedElement extends HTMLElement {
  private container: HTMLElement | null = null;
  private isLoading = false;
  private error: string | null = null;
  private data: any = null;

  static get observedAttributes() {
    return ['type', 'params'];
  }

  connectedCallback() {
    this.render();
    this.fetchData();
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (!this.isConnected) return;
    if (name === 'type' || name === 'params') {
      this.render();
      this.fetchData();
    }
  }

  private getType(): string {
    return this.getAttribute('type') || '';
  }

  private getParams(): Record<string, string> {
    const paramsStr = this.getAttribute('params') || '{}';
    try {
      return JSON.parse(paramsStr);
    } catch {
      return {};
    }
  }

  private async fetchData() {
    const type = this.getType();
    const params = this.getParams();

    if (!type) return;

    const cached = getCachedData(type, params);
    if (cached !== null) {
      this.data = cached;
      this.error = null;
      this.isLoading = false;
      this.renderContent();
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.renderContent();

    try {
      const response = await api.embedProxy(type, params);
      this.data = response.data;
      this.error = null;
      setCachedData(type, params, response.data, response.expiresAt);
    } catch {
      this.error = '数据暂不可用';
      this.data = null;
    } finally {
      this.isLoading = false;
      this.renderContent();
    }
  }

  private render() {
    const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; width: 100%; }
      .embed-container {
        background: #f8fafc; border: 1px solid #e2e8f0;
        border-radius: 0.5rem; padding: 0.75rem; font-family: system-ui, sans-serif;
        color: #334155;
      }
      :host-context(.dark), :host([data-theme="dark"]) .embed-container {
        background: #1e293b; border-color: #334155; color: #e2e8f0;
      }
      .embed-header {
        display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.75rem;
        color: #64748b; text-transform: uppercase; font-weight: 600;
      }
      :host-context(.dark) .embed-header { color: #64748b; }
      .embed-body { font-size: 0.875rem; }
      .skeleton { display: flex; flex-direction: column; gap: 0.5rem; }
      .skeleton-line {
        height: 1rem; background: #e2e8f0; border-radius: 0.25rem;
        animation: shimmer 1.5s infinite;
      }
      :host-context(.dark) .skeleton-line { background: #334155; }
      @keyframes shimmer {
        0% { opacity: 0.4; }
        50% { opacity: 0.8; }
        100% { opacity: 0.4; }
      }
      .error-box {
        padding: 0.5rem; text-align: center; color: #dc2626; font-size: 0.8rem;
        cursor: pointer; border-radius: 0.25rem; background: #fef2f2;
      }
      :host-context(.dark) .error-box { background: rgba(185, 28, 28, 0.2); color: #fca5a5; }
      .error-box:hover { background: #fee2e2; }
      :host-context(.dark) .error-box:hover { background: rgba(185, 28, 28, 0.3); }
      .stock-content { display: flex; align-items: baseline; gap: 0.75rem; }
      .stock-price { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
      :host-context(.dark) .stock-price { color: #f1f5f9; }
      .stock-change { font-size: 0.875rem; font-weight: 600; }
      .weather-content { display: flex; align-items: center; gap: 0.75rem; }
      .weather-icon { font-size: 2rem; }
      .weather-info { display: flex; flex-direction: column; }
      .weather-temp { font-size: 1.25rem; font-weight: 700; }
      .weather-desc { font-size: 0.8rem; color: #64748b; margin-top: 0.1rem; }
      :host-context(.dark) .weather-desc { color: #94a3b8; }
      .rss-list { margin: 0; padding: 0; list-style: none; }
      .rss-item { padding: 0.375rem 0; border-bottom: 1px solid #e2e8f0; }
      :host-context(.dark) .rss-item { border-color: #334155; }
      .rss-item:last-child { border-bottom: none; }
      .rss-link { color: #0ea5e9; text-decoration: none; font-size: 0.85rem; }
      :host-context(.dark) .rss-link { color: #38bdf8; }
      .rss-link:hover { text-decoration: underline; }
      .rss-date { font-size: 0.7rem; color: #94a3b8; margin-left: 0.5rem; }
      :host-context(.dark) .rss-date { color: #64748b; }
      .rss-empty { font-size: 0.85rem; color: #94a3b8; text-align: center; padding: 0.5rem; }
      :host-context(.dark) .rss-empty { color: #64748b; }
      .crypto-content { display: flex; align-items: center; gap: 0.5rem; }
      .crypto-label { font-size: 0.85rem; color: #64748b; }
      :host-context(.dark) .crypto-label { color: #94a3b8; }
      .crypto-price { font-size: 1.25rem; font-weight: 700; }
      .json-content {
        max-height: 15rem; overflow: auto; font-size: 0.75rem; font-family: monospace;
        padding: 0.5rem; background: #f1f5f9; border-radius: 0.25rem;
      }
      :host-context(.dark) .json-content { background: #0f172a; }
    `;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'embed-container';

    const header = document.createElement('div');
    header.className = 'embed-header';
    header.textContent = this.getType() || 'Embed';
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'embed-body';
    container.appendChild(body);

    shadow.appendChild(container);
    this.container = container;
  }

  private renderContent() {
    const body = this.container?.querySelector('.embed-body');
    if (!body) return;

    if (this.isLoading) {
      body.innerHTML = SKEL_LOADING;
      return;
    }

    if (this.error) {
      body.innerHTML = `<div class="error-box">${this.error}（点击重试）</div>`;
      const errorBox = body.querySelector('.error-box');
      if (errorBox) {
        errorBox.addEventListener('click', () => this.fetchData());
      }
      return;
    }

    if (this.data) {
      body.innerHTML = renderContent(this.getType(), this.data, this.getParams());
    }
  }
}

if (typeof window !== 'undefined' && !customElements.get('brain-embed')) {
  customElements.define('brain-embed', BrainEmbedElement);
}

export { BrainEmbedElement };

export function BrainEmbed({ type, params }: BrainEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = getCachedData(type, params);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.embedProxy(type, params);
        if (!cancelled) {
          setData(response.data);
          setCachedData(type, params, response.data, response.expiresAt);
        }
      } catch {
        if (!cancelled) {
          setError('数据暂不可用');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [type, JSON.stringify(params)]);

  const handleRetry = () => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.embedProxy(type, params, true);
        setData(response.data);
        setCachedData(type, params, response.data, response.expiresAt);
      } catch {
        setError('数据暂不可用');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  };

  return (
    <div className="embed-container">
      <div className="embed-header">{type}</div>
      <div className="embed-body">
        {loading && (
          <div className="skeleton">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        )}
        {error && !loading && (
          <div className="error-box" onClick={handleRetry}>
            {error}（点击重试）
          </div>
        )}
        {data && !loading && !error && (
          <div dangerouslySetInnerHTML={{ __html: renderContent(type, data, params) }} />
        )}
      </div>
    </div>
  );
}

export const brainEmbedPlugin = (md: any) => {
  md.inline.ruler.before('link', 'brain_embed', (state: any, silent: boolean) => {
    const src = state.src;
    const start = state.pos;
    const match = src.slice(start).match(/^<brain-embed\s+([^>]+)\/?>/i);
    if (!match) return false;

    const attrsStr = match[1];
    const attrs: Record<string, string> = {};
    const attrRegex = /(\w+)\s*=\s*["']([^"']+)["']/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    if (!attrs.type) return false;

    if (!silent) {
      const token = state.push('brain_embed', 'div', 0);
      token.attrs = Object.entries(attrs).map(([key, value]) => [key, value]);
    }

    state.pos = start + match[0].length;
    return true;
  });

  md.renderer.rules.brain_embed = (tokens: any, idx: number) => {
    const token = tokens[idx];
    const attrs: Record<string, string> = {};
    token.attrs?.forEach((attr: [string, string]) => {
      attrs[attr[0]] = attr[1];
    });

    const type = attrs.type || '';
    const params: Record<string, string> = {};
    Object.keys(attrs).forEach(key => {
      if (key !== 'type') {
        params[key] = attrs[key];
      }
    });

    return `<brain-embed type="${md.utils.escapeHtml(type)}" params="${md.utils.escapeHtml(JSON.stringify(params))}" />`;
  };
};

export default BrainEmbed;
