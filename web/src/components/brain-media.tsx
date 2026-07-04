import { useEffect, useRef } from 'react';

export interface BrainMediaProps {
  src: string;
  start?: number;
  type: 'audio' | 'video' | 'image';
  label?: string;
}

function resolveSrc(src: string): string {
  if (src.startsWith('library://')) {
    const hash = src.slice('library://'.length).split('?')[0];
    return `/api/library-files/${hash}/content`;
  }
  return src;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

class BrainMediaElement extends HTMLElement {
  private mediaEl: HTMLMediaElement | null = null;
  private timeDisplay: HTMLElement | null = null;
  private jumpBtn: HTMLButtonElement | null = null;

  static get observedAttributes() {
    return ['src', 'start', 'type', 'label'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  private render() {
    const rawSrc = this.getAttribute('src') || '';
    const src = resolveSrc(rawSrc);
    const startAttr = this.getAttribute('start');
    const start = startAttr ? parseFloat(startAttr) : 0;
    const type = (this.getAttribute('type') || 'audio') as 'audio' | 'video' | 'image';
    const label = this.getAttribute('label') || '';

    const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; --bm-bg: #f8fafc; --bm-fg: #334155; --bm-border: #e2e8f0; --bm-accent: #0ea5e9; }
      :host-context(.dark), :host([data-theme="dark"]) {
        --bm-bg: #1e293b; --bm-fg: #e2e8f0; --bm-border: #334155;
      }
      @media (prefers-color-scheme: dark) {
        :host { --bm-bg: #1e293b; --bm-fg: #e2e8f0; --bm-border: #334155; }
      }
      .container {
        background: var(--bm-bg); border: 1px solid var(--bm-border);
        border-radius: 0.5rem; padding: 0.75rem; font-family: system-ui, sans-serif;
        color: var(--bm-fg);
      }
      .header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.8rem; }
      .badge {
        background: var(--bm-accent); color: #fff; padding: 0.1rem 0.4rem;
        border-radius: 0.25rem; font-size: 0.7rem; font-weight: 600;
      }
      .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .controls { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.4rem; }
      .time { font-size: 0.75rem; opacity: 0.7; font-variant-numeric: tabular-nums; min-width: 5rem; }
      .jump-btn {
        background: var(--bm-accent); color: #fff; border: none; border-radius: 0.25rem;
        padding: 0.2rem 0.5rem; font-size: 0.7rem; cursor: pointer;
      }
      .jump-btn:hover { opacity: 0.85; }
      .jump-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      media { width: 100%; border-radius: 0.375rem; display: block; }
      img { max-width: 100%; border-radius: 0.375rem; display: block; }
    `;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'container';

    const header = document.createElement('div');
    header.className = 'header';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = type.toUpperCase();

    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label || rawSrc;

    header.appendChild(badge);
    header.appendChild(labelEl);
    container.appendChild(header);

    if (type === 'image') {
      const img = document.createElement('img');
      img.src = src;
      img.alt = label;
      container.appendChild(img);
    } else {
      const media = document.createElement(type === 'video' ? 'video' : 'audio');
      media.controls = true;
      media.src = src;
      media.style.width = '100%';
      this.mediaEl = media;
      container.appendChild(media);

      const controls = document.createElement('div');
      controls.className = 'controls';

      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = '00:00';
      this.timeDisplay = time;

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'jump-btn';
      jumpBtn.textContent = `跳转 ${formatTime(start)}`;
      jumpBtn.disabled = start <= 0;
      jumpBtn.addEventListener('click', () => {
        if (this.mediaEl) {
          this.mediaEl.currentTime = start;
          this.mediaEl.play().catch(() => {});
        }
      });
      this.jumpBtn = jumpBtn;

      controls.appendChild(time);
      controls.appendChild(jumpBtn);
      container.appendChild(controls);

      media.addEventListener('timeupdate', () => {
        if (this.timeDisplay) this.timeDisplay.textContent = formatTime(media.currentTime);
      });

      if (start > 0) {
        media.addEventListener('loadedmetadata', () => {
          media.currentTime = start;
        }, { once: true });
      }
    }

    shadow.appendChild(container);
  }
}

if (typeof window !== 'undefined' && !customElements.get('brain-media')) {
  customElements.define('brain-media', BrainMediaElement);
}

export { BrainMediaElement };

export function BrainMedia({ src, start, type, label }: BrainMediaProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !customElements.get('brain-media')) {
      customElements.define('brain-media', BrainMediaElement);
    }
  }, []);

  return (
    // @ts-expect-error custom element not in JSX intrinsic elements
    <brain-media
      ref={ref}
      src={src}
      start={start !== undefined ? String(start) : undefined}
      type={type}
      label={label}
    />
  );
}

export default BrainMedia;
