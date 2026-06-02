class STEntityTranslators {
  static toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  static calculateScaleFactor(source, destination) {
    const from = this.toNumber(source, 1);
    const to = this.toNumber(destination, 1);
    if (!Number.isFinite(from) || from <= 0) return 1;
    if (!Number.isFinite(to) || to <= 0) return 1;
    return to / from;
  }

  static rotate(cx, cy, x, y, angle) {
    const ncx = this.toNumber(cx, 0);
    const ncy = this.toNumber(cy, 0);
    const nx = this.toNumber(x, 0);
    const ny = this.toNumber(y, 0);
    const na = this.toNumber(angle, 0);

    if (!na) return [nx, ny];

    const radians = (Math.PI / 180) * na;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const dx = nx - ncx;
    const dy = ny - ncy;

    return [
      ncx + dx * cos - dy * sin,
      ncy + dx * sin + dy * cos
    ];
  }

	static translatePoint(
	  ox,
	  oy,
	  x,
	  y,
	  cx,
	  cy,
	  angle,
	  scale,
	  px,
	  py,
	  _w,
	  _h,
	  _sourceGrid,
	  _sourceCenterX,
	  _sourceCenterY
	) {
	  const sourceX = this.toNumber(x, 0);
	  const sourceY = this.toNumber(y, 0);
	  const tileX = this.toNumber(ox, 0);
	  const tileY = this.toNumber(oy, 0);
	  const s = this.toNumber(scale, 1);
	  const padX = this.toNumber(px, 0);
	  const padY = this.toNumber(py, 0);

	  let nx = tileX + (sourceX - padX) * s;
	  let ny = tileY + (sourceY - padY) * s;

	  const targetCenterX = this.toNumber(cx, 0);
	  const targetCenterY = this.toNumber(cy, 0);
	  const a = this.toNumber(angle, 0);

	  if (a) {
		[nx, ny] = this.rotate(targetCenterX, targetCenterY, nx, ny, a);
	  }

	  return [nx, ny];
	}

  static translatePointWidth(
    ox,
    oy,
    x,
    y,
    cx,
    cy,
    angle,
    scale,
    px,
    py,
    w,
    h,
    sourceGrid,
    sourceCenterX,
    sourceCenterY
  ) {
    const sourceX = this.toNumber(x, 0);
    const sourceY = this.toNumber(y, 0);
    const sourceW = this.toNumber(w, 0);
    const sourceH = this.toNumber(h, 0);
    const s = this.toNumber(scale, 1);

    const centerX = sourceX + (sourceW / 2);
    const centerY = sourceY + (sourceH / 2);

    const [tx, ty] = this.translatePoint(
      ox,
      oy,
      centerX,
      centerY,
      cx,
      cy,
      angle,
      s,
      px,
      py,
      undefined,
      undefined,
      sourceGrid,
      sourceCenterX,
      sourceCenterY
    );

    const width = sourceW * s;
    const height = sourceH * s;

    return [
      tx - (width / 2),
      ty - (height / 2),
      width,
      height
    ];
  }

	static translatePointWidthGrids(
	  ox, oy, x, y, cx, cy, angle, scale, px, py, w, h,
	  sourceGrid = 100, sourceCenterX, sourceCenterY
	) {
	  const sg = this.toNumber(sourceGrid, 100);
	  const s = this.toNumber(scale, 1);
	  const gridWidth = this.toNumber(w, 1);
	  const gridHeight = this.toNumber(h, 1);

	  // Центр токена в пикселях исходной сцены
	  const pixelW = gridWidth * sg;
	  const pixelH = gridHeight * sg;

	  const [nx, ny] = this.translatePoint(
		ox, oy,
		x + pixelW / 2,
		y + pixelH / 2,
		cx, cy, angle, s, px, py,
		undefined, undefined, sourceGrid, sourceCenterX, sourceCenterY
	  );

	  // Целевой размер = gridSize × scale (не sourceGrid × scale)
	  const targetPixelW = gridWidth * sg * s;
	  const targetPixelH = gridHeight * sg * s;

	  return [
		Number.isFinite(nx) ? Math.round(nx - targetPixelW / 2) : 0,
		Number.isFinite(ny) ? Math.round(ny - targetPixelH / 2) : 0,
		gridWidth,
		gridHeight
	  ];
	}

  static translateWall(
    ox,
    oy,
    cx,
    cy,
    angle,
    scale,
    px,
    py,
    c,
    sourceGrid,
    sourceCenterX,
    sourceCenterY
  ) {
    const coords = Array.isArray(c) ? c : [];
    if (coords.length < 4) return coords;

    const [x1, y1] = this.translatePoint(
      ox, oy, coords[0], coords[1], cx, cy, angle, scale, px, py,
      undefined, undefined, sourceGrid, sourceCenterX, sourceCenterY
    );
    const [x2, y2] = this.translatePoint(
      ox, oy, coords[2], coords[3], cx, cy, angle, scale, px, py,
      undefined, undefined, sourceGrid, sourceCenterX, sourceCenterY
    );

    return [x1, y1, x2, y2];
  }

  static getScaledTileSize(source, scale) {
    const width = this.toNumber(source?.width, 0);
    const height = this.toNumber(source?.height, 0);
    const factor = this.toNumber(scale, 1);

    return {
      width: width * factor,
      height: height * factor
    };
  }
}

globalThis.STEntityTranslators = STEntityTranslators;