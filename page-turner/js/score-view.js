// 악보 화면: OpenSheetMusicDisplay 로 악보를 그리고, 화면 높이에 맞춰 "페이지"로 나눕니다.
// 한 페이지 = 화면에 한 번에 보이는 줄(system)들의 묶음. 태블릿을 세우든 눕히든 화면에 맞게 다시 나눕니다.
(function (root) {
  'use strict';

  const UNIT = 10; // OSMD 내부 단위 → 픽셀 (zoom 1 기준)

  class ScoreView {
    constructor(viewport) {
      this.viewport = viewport;
      this.sheet = document.createElement('div');
      this.sheet.className = 'sheet';
      this.viewport.appendChild(this.sheet);
      this.cover = document.createElement('div'); // 다음 페이지 줄이 살짝 보이지 않도록 가림
      this.cover.className = 'page-cover';
      this.viewport.appendChild(this.cover);
      this.highlight = document.createElement('div');
      this.highlight.className = 'measure-highlight';
      this.playhead = document.createElement('div');
      this.playhead.className = 'playhead';
      this.sheet.appendChild(this.highlight);
      this.sheet.appendChild(this.playhead);
      this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.sheet, {
        autoResize: false,
        backend: 'svg',
        drawTitle: true,
        drawComposer: true,
        drawPartNames: false,
        followCursor: false,
      });
      this.pages = []; // [{top, bottom, firstMeasure, lastMeasure}]
      this.systems = []; // [{top, bottom, measures:[{index, x, width}]}]
      this.measurePage = []; // 마디 인덱스 → 페이지
      this.page = 0;
      this.zoom = 1;
    }

    async load(xmlText) {
      await this.osmd.load(xmlText);
      this.render();
    }

    setZoom(z) {
      this.zoom = z;
      if (this.osmd.GraphicSheet) this.render();
    }

    render() {
      this.osmd.zoom = this.zoom;
      this.osmd.render();
      // OSMD가 그린 svg 뒤에 강조 표시가 오도록 다시 붙임
      this.sheet.appendChild(this.highlight);
      this.sheet.appendChild(this.playhead);
      this._collectLayout();
      this.paginate();
    }

    _collectLayout() {
      const px = UNIT * this.zoom;
      this.systems = [];
      for (const page of this.osmd.GraphicSheet.MusicPages) {
        for (const sys of page.MusicSystems) {
          const ps = sys.PositionAndShape;
          const y = ps.AbsolutePosition.y;
          const measures = sys.GraphicalMeasures.map((staffMeasures) => {
            const gm = staffMeasures[0];
            const mps = gm.PositionAndShape;
            return {
              index: gm.parentSourceMeasure.measureListIndex,
              x: mps.AbsolutePosition.x * px,
              width: mps.Size.width * px,
            };
          });
          // 마디 높이: 첫 보표 위 ~ 마지막 보표 아래
          const staffTop = (y + ps.BorderMarginTop) * px;
          const staffBottom = (y + ps.BorderMarginBottom) * px;
          this.systems.push({ top: staffTop, bottom: staffBottom, staffTop: y * px, measures });
        }
      }
    }

    // 화면 높이에 맞춰 줄들을 페이지로 묶습니다.
    paginate() {
      const h = this.viewport.clientHeight;
      const margin = 12;
      this.pages = [];
      let cur = null;
      this.systems.forEach((s, i) => {
        const top = i === 0 ? 0 : s.top - margin; // 첫 페이지는 제목부터
        if (!cur || s.bottom + margin - cur.top > h) {
          cur = { top, bottom: s.bottom + margin, systems: [i] };
          this.pages.push(cur);
        } else {
          cur.bottom = s.bottom + margin;
          cur.systems.push(i);
        }
      });
      this.measurePage = [];
      this.pages.forEach((p, pi) => {
        const ms = p.systems.flatMap((si) => this.systems[si].measures.map((m) => m.index));
        p.firstMeasure = Math.min(...ms);
        p.lastMeasure = Math.max(...ms);
        for (const m of ms) this.measurePage[m] = pi;
      });
      this.showPage(Math.min(this.page, this.pages.length - 1), false);
    }

    pageOfMeasure(measureIndex) {
      const p = this.measurePage[measureIndex];
      return p == null ? this.page : p;
    }

    showPage(i, animate = true) {
      if (!this.pages.length) return;
      i = Math.max(0, Math.min(this.pages.length - 1, i));
      const changed = i !== this.page;
      this.page = i;
      const p = this.pages[i];
      this.sheet.style.transition = animate ? 'transform 0.28s ease-out' : 'none';
      this.sheet.style.transform = `translateY(${-p.top}px)`;
      // 페이지 아래에 걸친 다음 줄은 가림
      const visible = p.bottom - p.top;
      this.cover.style.top = `${Math.max(0, visible)}px`;
      if (changed && this.onPageChange) this.onPageChange(i);
    }

    // 현재 마디 강조 + 재생 위치 선
    setPosition(measureIndex, fraction) {
      const loc = this._measureRect(measureIndex);
      if (!loc) {
        this.highlight.style.display = 'none';
        this.playhead.style.display = 'none';
        return;
      }
      const { sys, m } = loc;
      Object.assign(this.highlight.style, {
        display: 'block',
        left: `${m.x}px`,
        top: `${sys.top}px`,
        width: `${m.width}px`,
        height: `${sys.bottom - sys.top}px`,
      });
      Object.assign(this.playhead.style, {
        display: 'block',
        left: `${m.x + m.width * fraction}px`,
        top: `${sys.top}px`,
        height: `${sys.bottom - sys.top}px`,
      });
    }

    hidePosition() {
      this.highlight.style.display = 'none';
      this.playhead.style.display = 'none';
    }

    _measureRect(measureIndex) {
      for (const sys of this.systems) {
        const m = sys.measures.find((x) => x.index === measureIndex);
        if (m) return { sys, m };
      }
      return null;
    }

    // 화면 좌표 → 마디 인덱스 (마디를 눌러 시작 위치를 정할 때)
    measureAt(clientX, clientY) {
      const r = this.sheet.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      for (const sys of this.systems) {
        if (y < sys.top - 10 || y > sys.bottom + 10) continue;
        for (const m of sys.measures) if (x >= m.x && x <= m.x + m.width) return m.index;
      }
      return null;
    }
  }

  root.PT = Object.assign(root.PT || {}, { ScoreView });
})(typeof window !== 'undefined' ? window : globalThis);
