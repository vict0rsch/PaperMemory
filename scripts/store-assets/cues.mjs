// Visual cues for the videos (never for the store stills): a synthetic cursor and highlights,
// injected into the recorded page, and a camera (zoom and pan) applied by ffmpeg afterwards.
// The cursor goes to the element's centre, then Puppeteer clicks those same coordinates.
// Camera moves are logged with their times during the recording, so they follow what really
// happened (e.g. when the save notice appeared).

const EASE = "cubic-bezier(0.45, 0, 0.2, 1)";
const ARROW = `<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2v22.5l5.6-5.3 3.6 8.3 3.7-1.6-3.6-8.1H19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/** Install the overlay (idempotent; again after each navigation) */
const install = (page) =>
    page.evaluate((ARROW) => {
        if (document.getElementById("pm-cues")) return;
        const root = document.createElement("div");
        root.id = "pm-cues";
        root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
        root.innerHTML = `<div id="pm-cue-hl" style="position:fixed;opacity:0;border-radius:12px;box-shadow:0 0 0 3px rgba(198,40,40,.85),0 0 24px 6px rgba(198,40,40,.35),0 0 0 9999px rgba(20,24,30,.28)"></div>
            <div id="pm-cue-cur" style="position:fixed;left:0;top:0;opacity:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));will-change:transform">${ARROW}</div>`;
        document.documentElement.appendChild(root);
    }, ARROW);

/**
 * Cues for `page`. offset: where the page sits in the recorded page area, in CSS px (the popup,
 * recorded as a tab, sits at 818, 1), so camera targets can be given in the page's own px.
 */
export const cues = (page, offset = [0, 0], size = [1280, 740]) => {
    let pos = null;
    let t0 = 0;
    const keys = []; // camera: { t, d, z, cx, cy, box }
    keys.rings = []; // ringed boxes, checked against the camera too
    const fitted = ([x, y, w, h], zmax, m = 24) => {
        const z = Math.max(1, Math.min(zmax, size[0] / (w + 2 * m), size[1] / (h + 2 * m)));
        const box = [x + offset[0], y + offset[1], w, h];
        return { z, cx: box[0], cy: box[1], box };
    };
    const c = {
        /** The clip's time origin (call with the recording's mark) */
        start: () => (t0 = Date.now() / 1000),
        now: () => Date.now() / 1000 - t0,
        install: () => install(page),
        /** Centre of an element in CSS px; `pick` runs in the page and returns it */
        center: async (pick, arg) => {
            const el = await page.evaluateHandle(pick, arg);
            const box = await el.evaluate((e) => {
                const r = e.getBoundingClientRect();
                return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height];
            });
            await el.dispose();
            return box;
        },
        /** Show the cursor at x, y (fades in) */
        show: async (x, y) => {
            await install(page);
            pos = [x, y];
            await page.mouse.move(x, y);
            await page.evaluate(([x, y]) => {
                const e = document.getElementById("pm-cue-cur");
                e.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
                e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: "forwards" });
            }, pos);
        },
        /** Glide to x, y along an eased path (a slight arc) */
        move: async (x, y, ms = 800) => {
            if (!pos) await c.show(x - 160, y + 120);
            const [x0, y0] = pos;
            pos = [x, y];
            await page.evaluate(
                async ([x0, y0, x, y, ms, ease]) => {
                    const mx = (x0 + x) / 2 + (y - y0) * 0.12, my = (y0 + y) / 2 - (x - x0) * 0.12;
                    const f = (px, py, o) => ({ transform: `translate(${px - 2}px, ${py - 2}px)`, offset: o });
                    await document.getElementById("pm-cue-cur").animate([f(x0, y0, 0), f(mx, my, 0.5), f(x, y, 1)], { duration: ms, easing: ease, fill: "forwards", composite: "replace" }).finished;
                },
                [x0, y0, x, y, ms, EASE],
            );
            await page.mouse.move(x, y); // the real pointer follows (hover states)
        },
        /** Move to x, y, show a click ring there, then really click those coordinates */
        click: async (x, y, ms) => {
            await c.move(x, y, ms);
            await page.evaluate(([x, y]) => {
                const r = document.createElement("div");
                r.style.cssText = `position:fixed;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;border:2px solid rgba(198,40,40,.8);background:rgba(198,40,40,.12)`;
                document.getElementById("pm-cues").appendChild(r);
                r.animate([{ transform: "scale(.4)", opacity: 1 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 450, easing: "ease-out" }).onfinish = () => r.remove();
            }, [x, y]);
            await page.mouse.click(x, y);
        },
        hide: () => page.evaluate(() => document.getElementById("pm-cue-cur")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" })),
        /** A soft ring around [cx, cy, w, h] and the rest dimmed, for `ms` (not awaited) */
        highlight: async ([cx, cy, w, h], ms = 1000) => {
            keys.rings.push({ t: c.now(), box: [cx + offset[0], cy + offset[1], w, h] });
            await install(page);
            await page.evaluate(
                ([cx, cy, w, h, ms]) => {
                    const e = document.getElementById("pm-cue-hl");
                    Object.assign(e.style, { left: `${cx - w / 2 - 6}px`, top: `${cy - h / 2 - 6}px`, width: `${w + 12}px`, height: `${h + 12}px` });
                    e.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: ms, easing: "ease-in-out" });
                },
                [cx, cy, w, h, ms],
            );
        },
        /** A file's text in a viewer panel over the page (e.g. an exported .bib) */
        file: async (name, text) => {
            await install(page);
            await page.evaluate(
                (name, text) => {
                    const f = document.createElement("div");
                    f.id = "pm-cue-file";
                    f.style.cssText = "position:fixed;right:28px;top:24px;bottom:24px;width:600px;display:flex;flex-direction:column;background:#fff;color:#1b2028;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(27,32,40,.14),0 18px 50px rgba(27,32,40,.3);font:13px/1.4 Inter,system-ui,sans-serif";
                    const head = document.createElement("div");
                    head.style.cssText = "padding:10px 14px;background:#f3f4f6;border-bottom:1px solid #dde1e7;font-weight:600";
                    head.textContent = name;
                    const pre = document.createElement("pre");
                    pre.style.cssText = "margin:0;padding:12px 14px;overflow:hidden;font:11.5px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap";
                    pre.textContent = text;
                    f.append(head, pre);
                    document.getElementById("pm-cues").appendChild(f);
                    f.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "ease-out" });
                },
                name,
                text,
            );
        },
        /** Camera: from now, ease over d seconds to zoom z centred on cx, cy (CSS px) */
        camera: (z, cx, cy, d = 0.6) => keys.push({ t: c.now(), d, z, cx: cx + offset[0], cy: cy + offset[1] }),
        /**
         * Camera onto a target box [cx, cy, w, h] (page px): the zoom is at most zmax and small
         * enough that the whole box (and a margin) stays in the view
         */
        fit: (box, zmax, d = 0.6) => keys.push({ t: c.now(), d, ...fitted(box, zmax) }),
        fitInitial: (box, zmax) => (keys.initial = fitted(box, zmax)),
        /** Camera: back to no zoom, from where it is */
        out: (d = 0.6) => {
            const k = keys.at(-1) || keys.initial || { cx: 0, cy: 0 };
            keys.push({ t: c.now(), d, z: 1, cx: k.cx, cy: k.cy });
        },
        /** The camera's state when the clip starts (default: no zoom) */
        initial: (z, cx, cy) => (keys.initial = { z, cx: cx + offset[0], cy: cy + offset[1] }),
        keys,
    };
    return c;
};

/**
 * Targets (camera boxes, ringed boxes) not wholly in the view the camera shows once it has
 * settled at their time: [] when none
 */
export const cropped = (keys, [w, h]) => {
    const state = (t) => [keys.initial || { z: 1, cx: w / 2, cy: h / 2 }, ...keys].filter((k) => !k.t || k.t <= t + 1e-3).at(-1);
    const out = (box, { z, cx, cy }) => {
        const [bx, by, bw, bh] = box, vw = w / z, vh = h / z;
        const x0 = Math.max(0, Math.min(w - vw, cx - vw / 2)), y0 = Math.max(0, Math.min(h - vh, cy - vh / 2));
        return bx - bw / 2 < x0 - 1 || bx + bw / 2 > x0 + vw + 1 || by - bh / 2 < y0 - 1 || by + bh / 2 > y0 + vh + 1;
    };
    const targets = [keys.initial, ...keys].filter((k) => k?.box).map((k) => ({ t: k.t ?? 0, box: k.box, k }));
    targets.push(...keys.rings.map((r) => ({ t: r.t, box: r.box, k: state(r.t) })));
    return targets.filter(({ box, k }) => out(box, k)).map(({ t, box, k }) => `t=${t.toFixed(2)} z=${k.z.toFixed(2)} box=${box.map(Math.round)}`);
};

/**
 * An ffmpeg zoompan filter for the logged camera moves. The page was recorded at `scale` device
 * px per CSS px (viewport w x h CSS px); the output is ow x oh.
 */
export const cameraFilter = (keys, [w, h], scale, [ow, oh]) => {
    const smooth = (p) => `(3*pow(${p},2)-2*pow(${p},3))`;
    // piecewise: hold, then ease from the previous value to the next over [t, t + d]
    const expr = (k) => {
        let state = keys.initial || { z: 1, cx: w / 2, cy: h / 2 };
        const segs = keys.map((key) => {
            const s = { from: state[k], to: key[k], t: key.t, d: key.d };
            state = key;
            return s;
        });
        let e = String(state[k]);
        for (const s of segs.reverse()) {
            const p = `((it-${s.t.toFixed(3)})/${s.d})`;
            e = `if(lt(it,${s.t.toFixed(3)}),${s.from},if(lt(it,${(s.t + s.d).toFixed(3)}),${s.from}+(${s.to - s.from})*${smooth(p)},${e}))`;
        }
        return e;
    };
    const vw = `(iw/zoom)`, vh = `(ih/zoom)`;
    return `zoompan=z='${expr("z")}':x='max(0,min(iw-${vw},${scale}*(${expr("cx")})-${vw}/2))':y='max(0,min(ih-${vh},${scale}*(${expr("cy")})-${vh}/2))':d=1:fps=30:s=${ow}x${oh}`;
};
