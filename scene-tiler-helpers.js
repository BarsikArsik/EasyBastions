class SceneTilerHelpers {
  /**
   * Delete all supported placeable documents from the active scene.
   *
   * @static
   * @returns {Promise<void>}
   */
  static async clearScene() {
    const scene = canvas.scene;
    if (!scene) return;

    for (const def of SceneTiler.layers) {
      let collection = null;

      if (typeof scene.getEmbeddedCollection === "function") {
        try {
          collection = scene.getEmbeddedCollection(def.className);
        } catch (_err) {
          collection = null;
        }
      }

      if (!collection) {
        collection = scene[def.type] ?? null;
      }

      const contents = collection?.contents ?? [];
      const ids = contents.map(doc => doc?.id).filter(Boolean);

      if (!ids.length) continue;
      await scene.deleteEmbeddedDocuments(def.className, ids);
    }
  }

  /**
   * Safely extract scene grid data with v14-first fallbacks.
   *
   * @static
   * @param {object} sceneData
   * @returns {{size:number, distance:number, units:string|null}}
   */
  static getGridData(sceneData) {
    const size = Number(
      sceneData?.grid?.size ??
      sceneData?.grid ??
      100
    );

    const distance = Number(
      sceneData?.grid?.distance ??
      sceneData?.gridDistance ??
      1
    );

    const units =
      sceneData?.grid?.units ??
      sceneData?.gridUnits ??
      null;

    return {
      size: Number.isFinite(size) && size > 0 ? size : 100,
      distance: Number.isFinite(distance) && distance > 0 ? distance : 1,
      units
    };
  }

  /**
   * Calculate scale ratio between source and target scenes.
   *
   * @static
   * @param {object} source
   * @param {object} target
   * @returns {number}
   */
  static getScaleFactor(source, target) {
    const sourceGrid = this.getGridData(source);
    const targetGrid = this.getGridData(target);

    if (
      sourceGrid.units &&
      targetGrid.units &&
      sourceGrid.units !== targetGrid.units
    ) {
      ui.notifications.warn(
        game.i18n.localize("SCNTILE.notifications.warn.unmatchedUnits")
      );
    }

    const distScale = STEntityTranslators.calculateScaleFactor(
      sourceGrid.distance,
      targetGrid.distance
    );

    const gridScale = STEntityTranslators.calculateScaleFactor(
      sourceGrid.size,
      targetGrid.size
    );

    if (!Number.isFinite(distScale) || distScale <= 0) return 1;
    if (!Number.isFinite(gridScale) || gridScale <= 0) return 1;

    return gridScale / distScale;
  }

  /**
   * Get source background dimensions excluding scene padding.
   *
   * @static
   * @param {object} source
   * @returns {{width: number, height: number}}
   */
	static getBackgroundDimensions(source) {
	  const sceneWidth = Number(source?.width ?? 0);
	  const sceneHeight = Number(source?.height ?? 0);
	  const padding = Number(source?.padding ?? 0);

	  const safeSceneWidth = Number.isFinite(sceneWidth) ? sceneWidth : 0;
	  const safeSceneHeight = Number.isFinite(sceneHeight) ? sceneHeight : 0;
	  const safePadding = Number.isFinite(padding) ? padding : 0;

	  // Foundry v12+: padding хранится в пикселях, а width/height уже без паддинга
	  if (safePadding >= 1) {
		return {
		  width: safeSceneWidth,
		  height: safeSceneHeight
		};
	  }

	  // Старый формат: padding — доля, width/height включают паддинг
	  const divisor = 1 + (2 * safePadding);

	  if (!Number.isFinite(divisor) || divisor <= 0) {
		return {
		  width: safeSceneWidth,
		  height: safeSceneHeight
		};
	  }

	  return {
		width: safeSceneWidth / divisor,
		height: safeSceneHeight / divisor
	  };
	}
  /**
   * Determine tile size and placement for a dropped scene tile.
   *
   * @static
   * @param {object} source
   * @param {number} x
   * @param {number} y
   * @param {boolean} [centered=true]
   * @returns {{width: number, height: number, x: number, y: number}}
   */
	static getTilePos(source, x, y, centered = true) {
	  const target = canvas.scene?.toObject?.() ?? {};
	  const scale = this.getScaleFactor(source, target);

	  const bg = this.getBackgroundDimensions(source);

	  const width =
		Number.isFinite(bg.width) && bg.width > 0 ? bg.width * scale : 0;
	  const height =
		Number.isFinite(bg.height) && bg.height > 0 ? bg.height * scale : 0;

	  let tx = Number(x ?? 0);
	  let ty = Number(y ?? 0);

	  if (!Number.isFinite(tx)) tx = 0;
	  if (!Number.isFinite(ty)) ty = 0;

	  if (centered) {
		tx -= width / 2;
		ty -= height / 2;
	  }

	  return {
		width,
		height,
		x: tx,
		y: ty
	  };
	}

  /**
   * Snap a point to the current scene grid.
   *
   * @static
   * @param {number} x
   * @param {number} y
   * @returns {{x: number, y: number}}
   */
	static getSnappedPosition(x, y) {
	  const grid = canvas.grid;

	  const nx = Number.isFinite(Number(x)) ? Number(x) : 0;
	  const ny = Number.isFinite(Number(y)) ? Number(y) : 0;

	  if (!grid) {
		return { x: nx, y: ny };
	  }

	  if (typeof grid.getSnappedPoint === "function") {
		const mode =
		  CONST?.GRID_SNAPPING_MODES?.CENTER ??
		  CONST?.GRID_SNAPPING_MODES?.TOP_LEFT ??
		  0;

		const point = grid.getSnappedPoint(
		  { x: nx, y: ny },
		  { mode, resolution: 1 }
		);

		return {
		  x: Number.isFinite(Number(point?.x)) ? Number(point.x) : nx,
		  y: Number.isFinite(Number(point?.y)) ? Number(point.y) : ny
		};
	  }

	  if (typeof grid.getSnappedPosition === "function") {
		const point = grid.getSnappedPosition(nx, ny, 1);

		return {
		  x: Number.isFinite(Number(point?.x)) ? Number(point.x) : nx,
		  y: Number.isFinite(Number(point?.y)) ? Number(point.y) : ny
		};
	  }

	  return { x: nx, y: ny };
	}

  /**
   * Calculate the effective source offset in pixels.
   *
   * This includes scene padding and optional background shifts.
   *
   * @static
   * @param {object} source
   * @returns {[number, number]}
   */
	static getPadding(source) {
	  const padding = Number(source?.padding ?? 0);
	  const width = Number(source?.width ?? 0);
	  const height = Number(source?.height ?? 0);

	  const shiftX = Number(
		source?.background?.offsetX ??
		source?.shiftX ??
		0
	  );

	  const shiftY = Number(
		source?.background?.offsetY ??
		source?.shiftY ??
		0
	  );

	  const safePadding = Number.isFinite(padding) ? padding : 0;
	  const safeWidth = Number.isFinite(width) ? width : 0;
	  const safeHeight = Number.isFinite(height) ? height : 0;
	  const safeShiftX = Number.isFinite(shiftX) ? shiftX : 0;
	  const safeShiftY = Number.isFinite(shiftY) ? shiftY : 0;

	  if (safePadding >= 1) {
		return [
		  safePadding + safeShiftX,
		  safePadding + safeShiftY
		];
	  }

	  return [
		safeWidth * safePadding + safeShiftX,
		safeHeight * safePadding + safeShiftY
	  ];
	}
	
	static getSceneCenter(source) {
	  const [px, py] = this.getPadding(source);
	  const bg = this.getBackgroundDimensions(source);

	  return [
		px + bg.width / 2,
		py + bg.height / 2
	  ];
	}	
}

/**
 * Macro helpers
 */
class STLayerSwitcher {
  static async create() {
    const scene = canvas.scene;
    const controlled = canvas.tiles?.controlled ?? [];

    if (!scene || !controlled.length) return;

    const layers = controlled
      .map(tile => ({
        id: tile.document.id,
        z: Number(tile.document.z ?? 0),
        active: false
      }))
      .sort((a, b) => a.z - b.z);

    await scene.setFlag("scene-tiler", "layers", layers);
  }

  static async next(forward = true) {
    const scene = canvas.scene;
    const tileLayer = canvas.tiles;

    if (!scene || !tileLayer) return;

    const stored = scene.getFlag("scene-tiler", "layers");
    if (!Array.isArray(stored) || !stored.length) return;

    const layers = foundry.utils.deepClone(stored);

    let activeIndex = layers.findIndex(layer => layer.active);
    if (activeIndex < 0) {
      activeIndex = forward ? layers.length - 1 : 0;
    }

    const nextIndex = forward
      ? (activeIndex + 1 >= layers.length ? 0 : activeIndex + 1)
      : (activeIndex - 1 < 0 ? layers.length - 1 : activeIndex - 1);

    const maxZ = layers.reduce(
      (max, layer) => Math.max(max, Number(layer.z ?? 0)),
      0
    );

    const activeTile =
      tileLayer.placeables.find(t => t.document.id === layers[activeIndex]?.id)?.document ?? null;

    const nextTile =
      tileLayer.placeables.find(t => t.document.id === layers[nextIndex]?.id)?.document ?? null;

    if (!activeTile || !nextTile) return;

    await activeTile.update({
      z: Number.isFinite(Number(layers[activeIndex].z))
        ? Number(layers[activeIndex].z)
        : 0,
      locked: false
    });

    layers[activeIndex].active = false;

    await nextTile.update({
      z: maxZ + 1,
      locked: true
    });

    layers[nextIndex].active = true;

    await scene.setFlag("scene-tiler", "layers", layers);
  }

  static async up() {
    return this.next(true);
  }

  static async down() {
    return this.next(false);
  }
}

globalThis.SceneTilerHelpers = SceneTilerHelpers;
globalThis.STLayerSwitcher = STLayerSwitcher;