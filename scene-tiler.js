/**
 * A set of placeable object data sorted by document class.
 * @typedef {{
 *   Token?: object[],
 *   Tile?: object[],
 *   AmbientLight?: object[],
 *   AmbientSound?: object[],
 *   Note?: object[],
 *   Wall?: object[],
 *   MeasuredTemplate?: object[],
 *   Drawing?: object[],
 * }} ObjectsData
 */

class SceneTiler {
  static get Translators() {
    return STEntityTranslators;
  }

  static get Helpers() {
    return SceneTilerHelpers;
  }

  static get layerDefs() {
    return {
      drawings: {
        layer: "drawings",
        type: "drawings",
        className: "Drawing",
        translator: this.Translators.translatePointWidth.bind(this.Translators)
      },
      walls: {
        layer: "walls",
        type: "walls",
        className: "Wall",
        translator: this.Translators.translateWall.bind(this.Translators)
      },
      templates: {
        layer: "templates",
        type: "templates",
        className: "MeasuredTemplate",
        translator: this.Translators.translatePoint.bind(this.Translators)
      },
      notes: {
        layer: "notes",
        type: "notes",
        className: "Note",
        translator: this.Translators.translatePoint.bind(this.Translators)
      },
      tokens: {
        layer: "tokens",
        type: "tokens",
        className: "Token",
        translator: this.Translators.translatePointWidthGrids.bind(this.Translators)
      },
      sounds: {
        layer: "sounds",
        type: "sounds",
        className: "AmbientSound",
        translator: this.Translators.translatePoint.bind(this.Translators)
      },
      lights: {
        layer: "lighting",
        type: "lights",
        className: "AmbientLight",
        translator: this.Translators.translatePoint.bind(this.Translators)
      },
      tiles: {
        layer: "background",
        type: "tiles",
        className: "Tile",
        translator: this.Translators.translatePointWidth.bind(this.Translators)
      }
    };
  }

  static get layers() {
    return Object.values(this.layerDefs);
  }

  static async create(
    scene,
    { x, y, rotation = 0, populate = false, centered = false } = {}
  ) {
    const targetScene = canvas.scene;
    if (!targetScene || !scene) return null;

    const created = await this.createTile(
      scene,
      scene.uuid,
      x ?? (targetScene.width / 2),
      y ?? (targetScene.height / 2),
      rotation,
      centered,
      populate
    );

    const tile = Array.isArray(created) ? (created[0] ?? null) : created;
    if (!tile) return null;

    if (populate && !tile.locked) {
      await this.deploySceneTile(tile);
    }

    return tile;
  }

  static async populate(tile) {
    return this.setTileState(tile, true);
  }

  static async clear(tile) {
    return this.setTileState(tile, false);
  }

  static async setTileState(tile, state) {
    if (tile?.flags?.["scene-tiler"]?.scene) {
      return tile.update({ locked: state });
    }

    const message = game.i18n.localize(
      "scene-tiler.notifications.warn.notaSceneTile"
    );
    console.warn(message);
    ui.notifications.warn(message);
    return null;
  }

  static async dropCanvasData(_canvas, data) {
    console.warn("SceneTiler dropCanvasData:", foundry.utils.deepClone(data));

    const x = Number(data?.x ?? 0);
    const y = Number(data?.y ?? 0);

    let uuid = data?.uuid ?? null;
    const type = data?.type ?? data?.documentName ?? null;
    const id = data?.id ?? data?._id ?? null;
    const pack = data?.pack ?? null;

    const isScene =
      type === "Scene" ||
      data?.documentName === "Scene" ||
      (typeof uuid === "string" &&
        (uuid.startsWith("Scene.") || uuid.startsWith("Compendium.")));

    if (!isScene) return;

    if (!uuid) {
      if (!id) {
        console.warn("SceneTiler: drop data has no id/uuid", data);
        return;
      }
      uuid = pack ? `Compendium.${pack}.${id}` : `Scene.${id}`;
    }

    const source = await fromUuid(uuid);
    if (!source) {
      console.warn("SceneTiler: source not found", uuid);
      ui.notifications.warn("Scene Tiler: scene not found.");
      return;
    }

    console.warn("SceneTiler: creating tile from", uuid);

    try {
		const { x: sx, y: sy } = this.Helpers.getSnappedPosition(x, y);
		return await this.createTile(source, uuid, sx, sy, 0, false, false);
    } catch (err) {
      console.error("SceneTiler createTile failed:", err);
      ui.notifications.error("Scene Tiler: failed to create tile. Check console.");
      return null;
    }
  }

  static async preUpdateTile(tileDoc, update, _options, _userId) {
    const isSceneTile = !!tileDoc?.flags?.["scene-tiler"]?.scene;
    const touchesLock = Object.prototype.hasOwnProperty.call(update, "locked");
    const touchesSize =
      Object.prototype.hasOwnProperty.call(update, "width") ||
      Object.prototype.hasOwnProperty.call(update, "height");

    if (!isSceneTile || (!touchesLock && !touchesSize)) return;

    if (touchesSize) {
      delete update.width;
      delete update.height;
      ui.notifications.warn(
        game.i18n.localize("SCNTILE.notifications.warn.noResize")
      );
    }

    if (touchesLock) {
      if (update.locked) await this.deploySceneTile(tileDoc);
      else await this.clearSceneTile(tileDoc);
    }
  }

  static async deploySceneTile(tileDoc) {
    const uuid = tileDoc?.flags?.["scene-tiler"]?.scene;
    if (!uuid) return;

    const source = await fromUuid(uuid);
    if (!source) return;

    await this.placeAllFromSceneAt(source, tileDoc);
  }

  static async clearSceneTile(tileDoc) {
    const scene = canvas.scene;
    const flags = tileDoc?.flags?.["scene-tiler"];
    if (!scene || !flags?.entities) return;

    for (const def of this.layers) {
      const ids = flags.entities[def.type];
      if (!Array.isArray(ids) || !ids.length) continue;
      await scene.deleteEmbeddedDocuments(def.className, ids);
    }

    await tileDoc.update({ "flags.scene-tiler.entities": null });
  }

  static async createTile(
    source,
    uuid,
    x,
    y,
    rotation = 0,
    centered = false,
    locked = false
  ) {
    const scene = canvas.scene;
    if (!scene) return [];

    const sourceData = source.toObject();
    const backgroundSrc =
      sourceData.background?.src ||
      sourceData.background ||
      "modules/scene-tiler/_Blank.png";

    const tileData = {
      texture: { src: backgroundSrc },
      flags: { "scene-tiler": { scene: uuid } },
      rotation,
      locked,
      ...this.Helpers.getTilePos(sourceData, x, y, centered)
    };

    console.warn("SceneTiler tileData", foundry.utils.deepClone(tileData));
	const created = await scene.createEmbeddedDocuments("Tile", [tileData]);
	console.warn("SceneTiler created tile actual", created?.[0]?.toObject?.() ?? created?.[0]);
	return created;
  }

  static async placeAllFromSceneAt(source, tileDoc) {
    const targetScene = canvas.scene;
    if (!targetScene) return;

    const tileData = tileDoc.toObject();
    const objects = this.getObjects(source, tileData);

    if (
      Hooks.call(
        "preCreatePlaceableObjects",
        targetScene,
        objects,
        {},
        game.userId
      ) === false
    ) {
      return;
    }

    const createdObjects = await this.createObjects(objects);
    const flagData = this.getObjectIds(createdObjects);

    await tileDoc.update({ "flags.scene-tiler.entities": flagData });
    Hooks.callAll(
      "createPlaceableObjects",
      targetScene,
      createdObjects,
      {},
      game.userId
    );
  }

  static async createObjects(objects) {
    const scene = canvas.scene;
    const createdObjects = {};
    if (!scene) return createdObjects;

    for (const def of this.layers) {
      let docs = objects[def.className];
      if (!Array.isArray(docs) || !docs.length) continue;

      docs = docs.map(d => {
        const clone = foundry.utils.deepClone(d);
        delete clone._id;
        delete clone.id;
        return clone;
      });

      let created = [];
      try {
        if (def.className === "Token") {
          console.warn("SceneTiler token docs", foundry.utils.deepClone(docs));
        }
        created = await scene.createEmbeddedDocuments(def.className, docs);
      } catch (error) {
        console.error(error);
        created = [];
      }

      if (!Array.isArray(created)) created = [created];
      if (created.length) createdObjects[def.className] = created;
    }

    return createdObjects;
  }

  static getObjectIds(objects) {
    const ids = {};

    for (const def of this.layers) {
      const docs = objects[def.className];
      if (!Array.isArray(docs) || !docs.length) continue;
      ids[def.type] = docs.map(doc => doc.id);
    }

    return ids;
  }

	static getObjects(source, tile) {
	  const objects = {};
	  const sourceData = source.toObject();
	  const targetData = canvas.scene?.toObject?.() ?? {};
	  const [px, py] = this.Helpers.getPadding(sourceData);
	  const scale = this.Helpers.getScaleFactor(sourceData, targetData);

	  const sourceGrid = Number(
		sourceData.grid?.size ??
		sourceData.grid ??
		source?.grid?.size ??
		source?.grid ??
		100
	  );
	  const safeSourceGrid = Number.isFinite(sourceGrid) && sourceGrid > 0 ? sourceGrid : 100;

	  const [sourceCenterX, sourceCenterY] = this.Helpers.getSceneCenter(sourceData);

	  const anchorX = Number(tile?.texture?.anchorX ?? 0);
	  const anchorY = Number(tile?.texture?.anchorY ?? 0);

	  const anchorOffsetX = tile.width * anchorX;
	  const anchorOffsetY = tile.height * anchorY;

	  const transformedTile = {
		...tile,
		x: tile.x - anchorOffsetX,
		y: tile.y - anchorOffsetY
	  };

		console.warn("SceneTiler transform context", {
		  tile: {
			x: tile.x,
			y: tile.y,
			width: tile.width,
			height: tile.height,
			rotation: tile.rotation,
			anchorX,
			anchorY
		  },
		  visualOrigin: {
			x: transformedTile.x,   // ← было visualTileX
			y: transformedTile.y    // ← было visualTileY
		  },
		  sourcePadding: { px, py },
		  sourceBackground: this.Helpers.getBackgroundDimensions(sourceData),
		  sourceCenter: { x: sourceCenterX, y: sourceCenterY },
		  scale,
		  sourceGrid: safeSourceGrid
		});

	  for (const def of this.layers) {
		const entities = this.prepareObjects(
		  sourceData,
		  def.type,
		  transformedTile,
		  scale,
		  px,
		  py,
		  safeSourceGrid,
		  sourceCenterX,
		  sourceCenterY
		);

		if (def.type === "tiles") {
		  this.getForegroundTile(entities, sourceData, transformedTile);
		}

		if (entities.length) {
		  objects[def.className] = entities;
		}
	  }

	  return objects;
	}

  static getForegroundTile(tiles, sourceData, tile) {
    const foregroundSrc = sourceData.foreground?.src ?? sourceData.foreground;
    if (!foregroundSrc) return;

    const minZ = tiles
      .filter(t => t.overhead)
      .reduce(
        (min, t) => (typeof t.z === "number" && t.z < min ? t.z : min),
        Number.MAX_VALUE
      );

    const foreground = {
      texture: { src: foregroundSrc },
      overhead: true,
      occlusion: { mode: 0 },
      x: tile.x,
      y: tile.y,
      z: minZ === Number.MAX_VALUE ? 0 : minZ - 1,
      rotation: tile.rotation,
      width: tile.width,
      height: tile.height
    };

    tiles.push(foreground);
  }

  static prepareObjects(sourceData, type, tile, ...spxy) {
    const collection = sourceData[type] ?? [];

    return collection.map(entity => {
      const objectData = foundry.utils.deepClone(entity);

      delete objectData._id;
      delete objectData.id;

      if (
        type === this.layerDefs.tiles.type &&
        typeof objectData.z === "number"
      ) {
        objectData.z += tile.z ?? 0;
      }

      return this.translateEntity(objectData, type, tile, ...spxy);
    });
  }

	static translateEntity(entity, type, tile, scale, px, py, sourceGrid, sourceCenterX, sourceCenterY) {
		const cx = tile.x + tile.width / 2;
		const cy = tile.y + tile.height / 2;

		if (type === this.layerDefs.walls.type) {
			return this.wallTranslate(entity, tile, cx, cy, scale, px, py, sourceGrid, sourceCenterX, sourceCenterY);
		  }


		return this.standardTranslate(entity, type, tile, cx, cy, scale, px, py, sourceGrid, sourceCenterX, sourceCenterY);
		}

	static standardTranslate(
	  entity,
	  type,
	  tile,
	  cx,
	  cy,
	  scale,
	  px,
	  py,
	  sourceGrid,
	  sourceCenterX,
	  sourceCenterY
	) {
	  const def = this.layers.find(d => d.type === type);
	  if (!def) return entity;

	  const original = foundry.utils.deepClone(entity);

	  const [x, y, w, h] = def.translator(
		tile.x,
		tile.y,
		entity.x,
		entity.y,
		cx,
		cy,
		tile.rotation,
		scale,
		px,
		py,
		entity.width,
		entity.height,
		sourceGrid,
		sourceCenterX,
		sourceCenterY
	  );

	  if (typeof entity.rotation !== "undefined") entity.rotation += tile.rotation;
	  if (typeof entity.direction !== "undefined") entity.direction += tile.rotation;

	  const nx = Number(x);
	  const ny = Number(y);

	  entity.x = Number.isFinite(nx) ? nx : 0;
	  entity.y = Number.isFinite(ny) ? ny : 0;

	  if (typeof w !== "undefined") {
		const nw = Number(w);
		const nh = Number(h);
		entity.width = Number.isFinite(nw) ? nw : 1;
		entity.height = Number.isFinite(nh) ? nh : 1;
	  }

	  if (type === "tokens") {
		console.warn("Translated token", {
		  original: {
			x: original.x,
			y: original.y,
			width: original.width,
			height: original.height
		  },
		  translated: {
			x: entity.x,
			y: entity.y,
			width: entity.width,
			height: entity.height
		  },
		  tile: {
			x: tile.x,
			y: tile.y,
			width: tile.width,
			height: tile.height
		  },
		  scale,
		  px,
		  py,
		  sourceGrid,
		  sourceCenterX,
		  sourceCenterY
		});
	  }

	  return entity;
	}

	static wallTranslate(entity, tile, cx, cy, scale, px, py, sourceGrid, sourceCenterX, sourceCenterY) {
	  const translatedCoords = this.layerDefs.walls.translator(
		tile.x,
		tile.y,
		cx,
		cy,
		tile.rotation,
		scale,
		px,
		py,
		entity.c,
		sourceGrid,
		sourceCenterX,  // ← убедись что это здесь есть
		sourceCenterY   // ← и это тоже
	  );
	  entity.c = translatedCoords;
	  return entity;
	}
}

Hooks.on("dropCanvasData", (...args) => SceneTiler.dropCanvasData(...args));
Hooks.on("preUpdateTile", (...args) => SceneTiler.preUpdateTile(...args));