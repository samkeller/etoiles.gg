
(async () => {
  "use strict";

  // ============================================================
  // OP.GG SVG EXTRACTOR — V3 FULL
  // Extraction + analyse + déduplication + export ZIP
  // ============================================================

  const CONFIG = {
    outputFile: `opgg-svgs-${Date.now()}.zip`,

    maxHtmlLength: 1800,
    maxTextLength: 220,
    maxAncestorDepth: 5,
    maxSiblingCount: 5,

    scanComputedBackgrounds: true,
    scanOpenShadowRoots: true,

    downloadConcurrency: 6,
    requestTimeout: 15000,

    includeHtmlSnapshots: true,
  };

  const startedAt = new Date();

  const assets = new Map();

  const diagnostics = {
    scannedElements: 0,
    scannedRoots: 0,
    inlineSvgOccurrences: 0,
    externalSvgOccurrences: 0,
    cssSvgOccurrences: 0,
    useOccurrences: 0,
    objectOccurrences: 0,
    errors: [],
  };

  const encoder = new TextEncoder();

  // ============================================================
  // UTILITIES
  // ============================================================

  const clean = (value) =>
    String(value ?? "").replace(/\s+/g, " ").trim();

  const truncate = (value, max = CONFIG.maxTextLength) => {
    const text = clean(value);
    return text.length > max ? text.slice(0, max) + "…" : text;
  };

  const slugify = (value) =>
    clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 65);

  const hash = async (value) => {
    const bytes = encoder.encode(value);

    if (globalThis.crypto?.subtle) {
      try {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      } catch {}
    }

    let h = 2166136261;

    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }

    return `fnv-${(h >>> 0).toString(16).padStart(8, "0")}`;
  };

  const isSvgUrl = (value) => {
    if (!value) return false;

    try {
      const url = new URL(value, document.baseURI);
      return /\.svg$/i.test(url.pathname);
    } catch {
      return /\.svg(?:[?#]|$)/i.test(value);
    }
  };

  const normalizeUrl = (value) => {
    try {
      const url = new URL(value, document.baseURI);
      url.hash = "";

      return {
        full: url.href,
        pathKey: `${url.origin}${url.pathname}`,
        origin: url.origin,
        pathname: url.pathname,
        query: url.search,
      };
    } catch {
      return {
        full: value,
        pathKey: value,
        origin: null,
        pathname: value,
        query: "",
      };
    }
  };

  const getAttribute = (element, name) =>
    element?.getAttribute?.(name) || "";

  const getDirectText = (element) => {
    if (!element) return "";

    return [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .map(clean)
      .filter(Boolean)
      .join(" ");
  };

  const getOwnLabel = (element) => {
    if (!element) return [];

    return [
      getAttribute(element, "aria-label"),
      getAttribute(element, "title"),
      getAttribute(element, "alt"),
      getAttribute(element, "data-tooltip"),
      getAttribute(element, "data-tip"),
      getAttribute(element, "data-title"),
    ]
      .map(clean)
      .filter(Boolean);
  };

  const getElementText = (element) => {
    if (!element) return "";

    return truncate(
      element.innerText || element.textContent || "",
      CONFIG.maxTextLength
    );
  };

  const getElementDescription = (element) => {
    if (!element) return null;

    const dataAttributes = {};

    for (const attr of [...(element.attributes || [])]) {
      if (attr.name.startsWith("data-")) {
        dataAttributes[attr.name] = truncate(attr.value, 150);
      }
    }

    return {
      tag: element.tagName?.toLowerCase() || null,
      id: getAttribute(element, "id") || null,
      className:
        typeof element.className === "string"
          ? truncate(element.className, 180)
          : null,
      role: getAttribute(element, "role") || null,
      href: getAttribute(element, "href") || null,
      ariaLabel: getAttribute(element, "aria-label") || null,
      title: getAttribute(element, "title") || null,
      alt: getAttribute(element, "alt") || null,
      dataAttributes,
      directText: truncate(getDirectText(element)),
      text: getElementText(element),
    };
  };

  // ============================================================
  // SVG VISUAL ANALYSIS
  // ============================================================

  const getSvgVisualData = (svg) => {
    if (!svg) return null;

    const count = (selector) => {
      try {
        return svg.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    };

    const title = clean(
      svg.querySelector(":scope > title")?.textContent
    );

    const description = clean(
      svg.querySelector(":scope > desc")?.textContent
    );

    const ids = [...svg.querySelectorAll("[id]")]
      .map((el) => getAttribute(el, "id"))
      .filter(Boolean)
      .slice(0, 30);

    const classes = [...svg.querySelectorAll("[class]")]
      .flatMap((el) =>
        (el.getAttribute("class") || "").split(/\s+/)
      )
      .filter(Boolean);

    const fills = [...svg.querySelectorAll("[fill]")]
      .map((el) => getAttribute(el, "fill"))
      .filter(Boolean);

    const strokes = [...svg.querySelectorAll("[stroke]")]
      .map((el) => getAttribute(el, "stroke"))
      .filter(Boolean);

    const allClasses = [
      ...new Set([
        ...(svg.getAttribute("class") || "").split(/\s+/),
        ...classes,
      ]),
    ].filter(Boolean);

    return {
      title: title || null,
      description: description || null,
      viewBox: getAttribute(svg, "viewBox") || null,
      width: getAttribute(svg, "width") || null,
      height: getAttribute(svg, "height") || null,
      preserveAspectRatio:
        getAttribute(svg, "preserveAspectRatio") || null,

      classNames: allClasses.slice(0, 40),
      ids,

      shapeCounts: {
        path: count("path"),
        circle: count("circle"),
        ellipse: count("ellipse"),
        rect: count("rect"),
        polygon: count("polygon"),
        polyline: count("polyline"),
        line: count("line"),
        text: count("text"),
        image: count("image"),
        use: count("use"),
        defs: count("defs"),
        mask: count("mask"),
        clipPath: count("clipPath"),
        linearGradient: count("linearGradient"),
        radialGradient: count("radialGradient"),
      },

      fillValues: [...new Set(fills)].slice(0, 15),
      strokeValues: [...new Set(strokes)].slice(0, 15),
      totalElements: svg.querySelectorAll("*").length,
    };
  };

  // ============================================================
  // DOM ROOTS
  // ============================================================

  const getRoots = () => {
    const roots = [document];
    const seen = new Set(roots);

    if (!CONFIG.scanOpenShadowRoots) return roots;

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];

      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot && !seen.has(element.shadowRoot)) {
          seen.add(element.shadowRoot);
          roots.push(element.shadowRoot);
        }
      }
    }

    return roots;
  };

  // ============================================================
  // CONTEXT EXTRACTION
  // ============================================================

  const getContext = (element) => {
    const ancestors = [];
    let current = element?.parentElement || null;
    let interactive = null;

    const interactiveSelector =
      'a, button, [role="button"], [role="link"], input, [tabindex]';

    while (current && ancestors.length < CONFIG.maxAncestorDepth) {
      ancestors.push(getElementDescription(current));

      if (!interactive && current.matches?.(interactiveSelector)) {
        interactive = current;
      }

      current = current.parentElement;
    }

    const siblings = [];
    const parent = element?.parentElement;

    if (parent) {
      for (const sibling of [...parent.children].slice(
        0,
        CONFIG.maxSiblingCount
      )) {
        if (sibling === element) continue;

        const description = getElementDescription(sibling);

        if (
          description.text ||
          description.ariaLabel ||
          description.alt ||
          description.title
        ) {
          siblings.push(description);
        }
      }
    }

    const nearbyImages = [];
    const scope = element?.parentElement || element;

    if (scope?.querySelectorAll) {
      for (const img of [...scope.querySelectorAll("img")].slice(0, 8)) {
        nearbyImages.push({
          src: getAttribute(img, "src") || null,
          alt: getAttribute(img, "alt") || null,
          title: getAttribute(img, "title") || null,
        });
      }
    }

    const ownLabels = getOwnLabel(element);
    const interactiveLabels = getOwnLabel(interactive);
    const interactiveText = getElementText(interactive);

    const directEvidence = [
      ...ownLabels.map((value) => ({
        value,
        source: "element-attribute",
      })),
      ...interactiveLabels.map((value) => ({
        value,
        source: "interactive-attribute",
      })),
    ];

    if (interactiveText) {
      directEvidence.push({
        value: interactiveText,
        source: "interactive-text",
      });
    }

    const ancestorEvidence = ancestors
      .map((ancestor, index) => ({
        value:
          ancestor.ariaLabel ||
          ancestor.title ||
          ancestor.directText ||
          "",
        source: `ancestor-${index + 1}`,
      }))
      .filter((item) => item.value);

    const context = {
      element: getElementDescription(element),
      interactiveElement: getElementDescription(interactive),
      ancestors,
      siblings,
      nearbyImages,
      directEvidence,
      ancestorEvidence,
    };

    if (CONFIG.includeHtmlSnapshots) {
      try {
        context.html = truncate(
          element?.parentElement?.outerHTML || element?.outerHTML || "",
          CONFIG.maxHtmlLength
        );
      } catch {
        context.html = null;
      }
    }

    return context;
  };

  // ============================================================
  // ASSET REGISTRY
  // ============================================================

  const getOrCreateAsset = async ({
    type,
    key,
    source,
    contentForHash = key,
  }) => {
    if (assets.has(key)) return assets.get(key);

    const id = await hash(contentForHash);

    const asset = {
      assetId: `${type}-${id.slice(0, 16)}`,
      type,
      source,
      occurrences: [],
      visualHints: [],
      contextHints: [],
      suggestedName: null,
      suggestedFunction: null,
      confidence: "low",
      ambiguity: false,
    };

    assets.set(key, asset);
    return asset;
  };

  const addUniqueHint = (list, value, source, strength) => {
    const normalized = clean(value);
    if (!normalized) return;

    const exists = list.some(
      (item) =>
        item.value.toLowerCase() === normalized.toLowerCase() &&
        item.source === source
    );

    if (!exists) {
      list.push({
        value: truncate(normalized, 150),
        source,
        strength,
      });
    }
  };

  const addContextHints = (asset, context) => {
    for (const evidence of context.directEvidence) {
      addUniqueHint(
        asset.contextHints,
        evidence.value,
        evidence.source,
        evidence.source.includes("attribute") ? "strong" : "medium"
      );
    }

    for (const evidence of context.ancestorEvidence) {
      addUniqueHint(
        asset.contextHints,
        evidence.value,
        evidence.source,
        "weak"
      );
    }
  };

  const addOccurrence = (asset, occurrence) => {
    asset.occurrences.push({
      occurrenceIndex: asset.occurrences.length + 1,
      ...occurrence,
    });
  };

  // ============================================================
  // INLINE SVG EXTRACTION
  // ============================================================

  const addInlineSvg = async (svg) => {
    const markup = svg.outerHTML;
    const key = `inline:${markup}`;
    const visual = getSvgVisualData(svg);
    const context = getContext(svg);

    const asset = await getOrCreateAsset({
      type: "inline-svg",
      key,
      source: {
        kind: "inline",
        tag: "svg",
      },
      contentForHash: markup,
    });

    // Contenu réellement exporté dans le ZIP.
    asset.svgContent = markup;
    asset.visual = visual;

    if (visual?.title) {
      addUniqueHint(
        asset.visualHints,
        visual.title,
        "svg-title",
        "strong"
      );
    }

    if (visual?.description) {
      addUniqueHint(
        asset.visualHints,
        visual.description,
        "svg-description",
        "strong"
      );
    }

    for (const className of visual?.classNames || []) {
      addUniqueHint(
        asset.visualHints,
        className,
        "svg-class",
        "weak"
      );
    }

    for (const id of visual?.ids || []) {
      addUniqueHint(
        asset.visualHints,
        id,
        "svg-id",
        "weak"
      );
    }

    addContextHints(asset, context);

    addOccurrence(asset, {
      kind: "inline-svg",
      pageUrl: location.href,
      context,
    });

    diagnostics.inlineSvgOccurrences++;
  };

  // ============================================================
  // EXTERNAL SVG EXTRACTION
  // ============================================================

  const addExternal = async ({
    url,
    kind,
    element,
    extra = {},
  }) => {
    if (!url || !isSvgUrl(url)) return;

    const normalized = normalizeUrl(url);
    const key = `external:${normalized.pathKey}`;
    const context = getContext(element);

    const asset = await getOrCreateAsset({
      type: "external-svg",
      key,
      source: {
        kind: "external",
        origin: normalized.origin,
        pathname: normalized.pathname,
      },
      contentForHash: normalized.pathKey,
    });

    asset.source.variants ||= [];

    if (!asset.source.variants.includes(normalized.full)) {
      asset.source.variants.push(normalized.full);
    }

    addContextHints(asset, context);

    addOccurrence(asset, {
      kind,
      url: normalized.full,
      query: normalized.query || null,
      pageUrl: location.href,
      context,
      ...extra,
    });

    diagnostics.externalSvgOccurrences++;

    if (kind === "css-background" || kind === "inline-style") {
      diagnostics.cssSvgOccurrences++;
    }

    if (["object", "embed", "iframe"].includes(kind)) {
      diagnostics.objectOccurrences++;
    }
  };

  // ============================================================
  // SVG USE REFERENCES
  // ============================================================

  const addUse = async (use) => {
    const href =
      getAttribute(use, "href") ||
      use.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
      "";

    if (!href) return;

    const context = getContext(use);
    const isLocalReference = href.startsWith("#");

    if (!isLocalReference && isSvgUrl(href)) {
      await addExternal({
        url: href,
        kind: "svg-use-reference",
        element: use,
        extra: { reference: href },
      });
    } else {
      const key = `local-use:${href}`;

      const asset = await getOrCreateAsset({
        type: "svg-use-reference",
        key,
        source: {
          kind: isLocalReference ? "local-symbol" : "external-reference",
          reference: href,
        },
        contentForHash: key,
      });

      addContextHints(asset, context);

      addOccurrence(asset, {
        kind: "svg-use-reference",
        reference: href,
        pageUrl: location.href,
        context,
      });
    }

    diagnostics.useOccurrences++;
  };

  // ============================================================
  // CSS URL EXTRACTION
  // ============================================================

  const extractCssUrls = (value) => {
    if (!value || value === "none") return [];

    const urls = [];
    const regex = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]*))\s*\)/gi;
    let match;

    while ((match = regex.exec(value)) !== null) {
      const url = clean(match[1] || match[2] || match[3])
        .replace(/^['"]|['"]$/g, "");

      if (url) urls.push(url);
    }

    return [...new Set(urls)];
  };

  // ============================================================
  // MAIN DOM SCAN
  // ============================================================

  console.log("[SVG Extractor] Analyse du DOM...");

  const roots = getRoots();
  diagnostics.scannedRoots = roots.length;

  for (const root of roots) {
    const elements = [...root.querySelectorAll("*")];

    diagnostics.scannedElements += elements.length;

    for (const element of elements) {
      try {
        const tag = element.tagName?.toLowerCase();

        if (tag === "svg") {
          await addInlineSvg(element);
        }

        if (tag === "img") {
          const src = getAttribute(element, "src");
          const srcset = getAttribute(element, "srcset");

          if (isSvgUrl(src)) {
            await addExternal({
              url: src,
              kind: "img",
              element,
            });
          }

          if (srcset) {
            const candidates = srcset
              .split(",")
              .map((part) => clean(part).split(/\s+/)[0])
              .filter(isSvgUrl);

            for (const url of candidates) {
              await addExternal({
                url,
                kind: "img-srcset",
                element,
              });
            }
          }
        }

        if (tag === "use") {
          await addUse(element);
        }

        if (["object", "embed", "iframe"].includes(tag)) {
          const url =
            getAttribute(element, "data") ||
            getAttribute(element, "src");

          const type = getAttribute(element, "type");

          if (isSvgUrl(url) || /svg/i.test(type)) {
            await addExternal({
              url,
              kind: tag,
              element,
              extra: { declaredType: type || null },
            });
          }
        }

        if (CONFIG.scanComputedBackgrounds) {
          const inlineStyle = getAttribute(element, "style");
          const hasBackgroundInStyle =
            /background(?:-image)?\s*:/i.test(inlineStyle);

          if (hasBackgroundInStyle || element.classList?.length) {
            const background = getComputedStyle(element).backgroundImage;

            for (const url of extractCssUrls(background)) {
              if (isSvgUrl(url)) {
                await addExternal({
                  url,
                  kind: "css-background",
                  element,
                  extra: {
                    cssProperty: "background-image",
                    inlineStyle: inlineStyle || null,
                  },
                });
              }
            }
          }

          for (const url of extractCssUrls(inlineStyle)) {
            if (isSvgUrl(url)) {
              await addExternal({
                url,
                kind: "inline-style",
                element,
                extra: { cssProperty: "style" },
              });
            }
          }
        }
      } catch (error) {
        diagnostics.errors.push({
          tag: element.tagName?.toLowerCase() || "unknown",
          message: String(error?.message || error),
        });
      }
    }
  }

  // ============================================================
  // SEMANTIC NAMING
  // ============================================================

  const ignoredLabels = new Set([
    "button",
    "icon",
    "image",
    "logo",
    "svg",
    "img",
    "more",
    "view more",
    "show more",
    "close",
    "open",
    "menu",
    "search",
    "settings",
    "unknown",
  ]);

  const cleanCandidate = (value) => {
    const normalized = clean(value);

    if (
      !normalized ||
      normalized.length < 3 ||
      normalized.length > 90
    ) {
      return null;
    }

    if (ignoredLabels.has(normalized.toLowerCase())) return null;
    if (normalized.split(/\s+/).length > 8) return null;

    return normalized;
  };

  const finalizeAsset = (asset) => {
    const strongVisual = asset.visualHints
      .filter((hint) => hint.strength === "strong")
      .map((hint) => cleanCandidate(hint.value))
      .filter(Boolean);

    const strongContext = asset.contextHints
      .filter(
        (hint) =>
          hint.strength === "strong" || hint.strength === "medium"
      )
      .map((hint) => cleanCandidate(hint.value))
      .filter(Boolean);

    const weakContext = asset.contextHints
      .filter((hint) => hint.strength === "weak")
      .map((hint) => cleanCandidate(hint.value))
      .filter(Boolean);

    const unique = (values) => [
      ...new Set(values.map((value) => value.toLowerCase())),
    ];

    const visualCandidates = unique(strongVisual);
    const contextCandidates = unique(strongContext);

    const candidates = visualCandidates.length
      ? visualCandidates
      : contextCandidates;

    asset.ambiguity = candidates.length > 1;

    if (candidates.length === 1) {
      const candidate =
        visualCandidates.length === 1
          ? strongVisual.find(
              (value) => value.toLowerCase() === visualCandidates[0]
            )
          : strongContext.find(
              (value) => value.toLowerCase() === contextCandidates[0]
            );

      asset.suggestedFunction = candidate || null;
      asset.suggestedName = candidate
        ? `${slugify(candidate)}.svg`
        : null;

      asset.confidence =
        visualCandidates.length === 1 ? "high" : "medium";
    } else if (candidates.length > 1) {
      asset.suggestedFunction = null;
      asset.suggestedName = null;
      asset.confidence = "ambiguous";
    } else if (weakContext.length) {
      asset.confidence = "low";
    }

    asset.fallbackName = `${asset.assetId}.svg`;
    asset.occurrenceCount = asset.occurrences.length;

    asset.urls = [
      ...new Set(
        asset.occurrences
          .map((occurrence) => occurrence.url)
          .filter(Boolean)
      ),
    ];

    return asset;
  };

  const finalAssets = [...assets.values()]
    .map(finalizeAsset)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  // ============================================================
  // ZIP CREATION
  // ============================================================

  const crc32 = (() => {
    const table = new Uint32Array(256);

    for (let n = 0; n < 256; n++) {
      let c = n;

      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }

      table[n] = c >>> 0;
    }

    return (bytes) => {
      let crc = 0xffffffff;

      for (const byte of bytes) {
        crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      }

      return (crc ^ 0xffffffff) >>> 0;
    };
  })();

  const toDosDateTime = (date = new Date()) => ({
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),

    date:
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  });

  const write16 = (view, offset, value) =>
    view.setUint16(offset, value, true);

  const write32 = (view, offset, value) =>
    view.setUint32(offset, value, true);

  const concatenate = (arrays) => {
    const totalLength = arrays.reduce(
      (sum, array) => sum + array.length,
      0
    );

    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const array of arrays) {
      result.set(array, offset);
      offset += array.length;
    }

    return result;
  };

  const createZip = (files) => {
    const localParts = [];
    const centralParts = [];

    let localOffset = 0;

    const { time, date } = toDosDateTime();

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const checksum = crc32(data);

      // Local file header
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);

      write32(localView, 0, 0x04034b50);
      write16(localView, 4, 20);
      write16(localView, 6, 0x0800);
      write16(localView, 8, 0);
      write16(localView, 10, time);
      write16(localView, 12, date);
      write32(localView, 14, checksum);
      write32(localView, 18, data.length);
      write32(localView, 22, data.length);
      write16(localView, 26, nameBytes.length);
      write16(localView, 28, 0);

      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, data);

      // Central directory entry
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);

      write32(centralView, 0, 0x02014b50);
      write16(centralView, 4, 20);
      write16(centralView, 6, 20);
      write16(centralView, 8, 0x0800);
      write16(centralView, 10, 0);
      write16(centralView, 12, time);
      write16(centralView, 14, date);
      write32(centralView, 16, checksum);
      write32(centralView, 20, data.length);
      write32(centralView, 24, data.length);
      write16(centralView, 28, nameBytes.length);
      write16(centralView, 30, 0);
      write16(centralView, 32, 0);
      write16(centralView, 34, 0);
      write16(centralView, 36, 0);
      write32(centralView, 38, 0);
      write32(centralView, 42, localOffset);

      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);

      localOffset += localHeader.length + data.length;
    }

    const centralDirectory = concatenate(centralParts);

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);

    write32(endView, 0, 0x06054b50);
    write16(endView, 4, 0);
    write16(endView, 6, 0);
    write16(endView, 8, files.length);
    write16(endView, 10, files.length);
    write32(endView, 12, centralDirectory.length);
    write32(endView, 16, localOffset);
    write16(endView, 20, 0);

    return new Blob(
      [...localParts, centralDirectory, end],
      { type: "application/zip" }
    );
  };

  // ============================================================
  // SVG VALIDATION
  // ============================================================

  const isValidSvg = (content) => {
    try {
      const doc = new DOMParser().parseFromString(
        content,
        "image/svg+xml"
      );

      return (
        doc.documentElement?.localName === "svg" &&
        !doc.querySelector("parsererror")
      );
    } catch {
      return false;
    }
  };

  // ============================================================
  // EXPORT REGISTRY
  // ============================================================

  const zipFiles = [];
  const failedDownloads = [];
  const contentRegistry = new Map();
  const usedNames = new Set();

  const makeSafeFilename = (value) => {
    const name = slugify(
      String(value || "").replace(/\.svg$/i, "")
    );

    return name || "unnamed-svg";
  };

  const getUniqueFilename = (baseName) => {
    const base = makeSafeFilename(baseName);

    let name = `${base}.svg`;
    let suffix = 2;

    while (usedNames.has(name.toLowerCase())) {
      name = `${base}-${suffix++}.svg`;
    }

    usedNames.add(name.toLowerCase());

    return `svg/${name}`;
  };

  const registerSvg = async ({
    content,
    preferredName,
    source,
    assetId,
  }) => {
    const contentHash = await hash(content);

    // Déduplication par contenu réel.
    if (contentRegistry.has(contentHash)) {
      const existing = contentRegistry.get(contentHash);
      existing.sources.push(source);

      return existing.name;
    }

    const filename = getUniqueFilename(
      preferredName || assetId || `svg-${contentHash.slice(0, 12)}`
    );

    const entry = {
      name: filename,
      data: encoder.encode(content),
      hash: contentHash,
      sources: [source],
      assetId,
    };

    contentRegistry.set(contentHash, entry);
    zipFiles.push(entry);

    return filename;
  };

  // ============================================================
  // EXPORT INLINE SVG
  // ============================================================

  console.log("[SVG Extractor] Export des SVG inline...");

  for (const asset of finalAssets) {
    if (asset.type !== "inline-svg" || !asset.svgContent) continue;

    await registerSvg({
      content: asset.svgContent,
      preferredName: asset.suggestedName || asset.fallbackName,
      assetId: asset.assetId,
      source: `Inline SVG — ${asset.occurrenceCount} occurrence(s)`,
    });
  }

  // ============================================================
  // EXPORT EXTERNAL SVG
  // ============================================================

  console.log("[SVG Extractor] Préparation des téléchargements externes...");

  const externalTasks = [];

  for (const asset of finalAssets) {
    if (asset.type !== "external-svg") continue;

    const urls = [
      ...new Set(
        asset.occurrences
          .map((occurrence) => occurrence.url)
          .filter(Boolean)
      ),
    ];

    for (const url of urls) {
      externalTasks.push({ asset, url });
    }
  }

  let completed = 0;
  let nextTask = 0;

  const worker = async (task) => {
    const { asset, url } = task;

    try {
      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.requestTimeout
      );

      let response;

      try {
        response = await fetch(url, {
          credentials: "same-origin",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();

      if (!isValidSvg(content)) {
        throw new Error("La réponse ne contient pas un SVG valide");
      }

      await registerSvg({
        content,
        preferredName: asset.suggestedName || asset.fallbackName,
        assetId: asset.assetId,
        source: url,
      });
    } catch (error) {
      failedDownloads.push({
        assetId: asset.assetId,
        url,
        error: String(error?.message || error),
      });
    } finally {
      completed++;

      if (
        completed % 10 === 0 ||
        completed === externalTasks.length
      ) {
        console.log(
          `[SVG Extractor] Téléchargements : ${completed}/${externalTasks.length}`
        );
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(CONFIG.downloadConcurrency, externalTasks.length) },
    async () => {
      while (nextTask < externalTasks.length) {
        const task = externalTasks[nextTask++];
        await worker(task);
      }
    }
  );

  await Promise.all(workers);

  // ============================================================
  // README
  // ============================================================

  const readme = [
    "OP.GG — SVG EXPORT",
    "==================",
    "",
    `Page : ${location.href}`,
    `Date : ${new Date().toISOString()}`,
    "",
    `Fichiers SVG exportés : ${zipFiles.length}`,
    `SVG inline détectés : ${diagnostics.inlineSvgOccurrences}`,
    `SVG externes détectés : ${diagnostics.externalSvgOccurrences}`,
    `URL externes tentées : ${externalTasks.length}`,
    `Échecs : ${failedDownloads.length}`,
    "",
    "FICHIERS",
    "--------",
    ...zipFiles.map((file) =>
      [
        file.name,
        `  Asset ID : ${file.assetId}`,
        `  SHA-256 : ${file.hash}`,
        ...file.sources.map((source) => `  Source : ${source}`),
      ].join("\n")
    ),
    "",
    "ÉCHECS DE TÉLÉCHARGEMENT",
    "------------------------",
    ...(failedDownloads.length
      ? failedDownloads.map(
          (item) =>
            `${item.assetId}\n  URL : ${item.url}\n  Erreur : ${item.error}`
        )
      : ["Aucun"]),
    "",
    "INFORMATIONS",
    "------------",
    "Les SVG sont dédupliqués par contenu réel.",
    "Les noms proposés sont heuristiques.",
    "Les noms incertains utilisent un identifiant neutre.",
    "Les références locales <use href='#...'> ne sont pas exportées",
    "comme fichiers autonomes.",
  ].join("\n");

  zipFiles.push({
    name: "README.txt",
    data: encoder.encode(readme),
  });

  // ============================================================
  // FINAL SUMMARY
  // ============================================================

  const summary = {
    scannedAt: startedAt.toISOString(),
    pageUrl: location.href,
    pageTitle: document.title,

    diagnostics,

    totals: {
      uniqueAssets: finalAssets.length,
      totalOccurrences: finalAssets.reduce(
        (sum, asset) => sum + asset.occurrenceCount,
        0
      ),
      inlineAssets: finalAssets.filter(
        (asset) => asset.type === "inline-svg"
      ).length,
      externalAssets: finalAssets.filter(
        (asset) => asset.type === "external-svg"
      ).length,
      exportedSvgFiles: zipFiles.length - 1,
      failedDownloads: failedDownloads.length,
      highConfidence: finalAssets.filter(
        (asset) => asset.confidence === "high"
      ).length,
      mediumConfidence: finalAssets.filter(
        (asset) => asset.confidence === "medium"
      ).length,
      lowConfidence: finalAssets.filter(
        (asset) => asset.confidence === "low"
      ).length,
      ambiguous: finalAssets.filter(
        (asset) => asset.confidence === "ambiguous"
      ).length,
    },
  };

  // ============================================================
  // ZIP DOWNLOAD
  // ============================================================

  console.log("[SVG Extractor] Création du ZIP...");

  const zipBlob = createZip(zipFiles);
  const zipUrl = URL.createObjectURL(zipBlob);

  const link = document.createElement("a");
  link.href = zipUrl;
  link.download = CONFIG.outputFile;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(zipUrl), 60000);

  // ============================================================
  // CONSOLE REPORT
  // ============================================================

  console.group("OP.GG SVG Extractor — V3 FULL");

  console.log("Résumé :");
  console.table(summary.totals);

  console.log("Diagnostics :", diagnostics);

  console.log("Assets :", finalAssets);

  if (failedDownloads.length) {
    console.warn("Téléchargements échoués :");
    console.table(failedDownloads);
  }

  console.log("ZIP :", CONFIG.outputFile);
  console.log("Taille :", `${(zipBlob.size / 1024).toFixed(1)} Ko`);

  console.groupEnd();

  return {
    summary,
    assets: finalAssets,
    failedDownloads,
    zipBlob,
  };
})();
