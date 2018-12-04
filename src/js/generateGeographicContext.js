/*
 * Copyright 2018 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */

import {
  SpinalNode,
  SPINAL_RELATION_TYPE
} from "spinalgraph";
import bimObjectService from "spinal-env-viewer-plugin-bimobjectservice";

import hasProperties from "./hasProperties";
import createTmpTree from "./createTmpTree";

const MAX_NON_SYNCHRONIZED_NODES = 300;

async function getChild(parent, nodeName, relationName) {
  const children = await parent.getChildren(relationName);

  for (let child of children) {
    if (child.getName().get() === nodeName) {
      return child;
    }
  }

  return null;
}

async function* GenerateGeoContextRec(context, parent, children, layout, depth) {
  if (children instanceof Map) {
    const promises = [];

    for (let [name, ] of children) {
      promises.push(getChild(parent, name, layout.relations[depth]));
    }

    const parentChildren = await Promise.all(promises);
    const entries = children.entries();

    for (let child of parentChildren) {
      let [name, value] = entries.next().value;

      if (child === null) {
        child = new SpinalNode(name, layout.types[depth]);

        yield parent.addChildInContext(
          child,
          layout.relations[depth],
          SPINAL_RELATION_TYPE,
          context
        );
      }

      yield* GenerateGeoContextRec(context, child, value, layout, depth + 1);
    }
  } else {
    for (let child of children) {
      yield bimObjectService.addBIMObject(context, parent, child.dbId, child.name);
    }
  }
}

async function waitForFileSystem(promises) {
  let nodes = await Promise.all(promises);

  return new Promise(resolve => {
    let inter = setInterval(() => {
      nodes = nodes.filter(node => {
        return FileSystem._objects[node._server_id] === undefined;
      });

      if (nodes.length === 0) {
        clearInterval(inter);
        resolve();
      }
    }, 1000);
  });
}

/**
 * Generates a geographic context using the autodesk forge object tree.
 * @param {SpinalContext} context Context to fill
 * @param {Object} layout Object containing the types, keys and relation names necessary to generate the context
 * @param {Array<Number>} referencial DbIds to use
 * @return {SpinalContext} The geographic context
 */
async function GenerateGeoContext(context, layout, referencial) {
  const promiseResults = await Promise.all([
    hasProperties(referencial, layout.keys), // Get all useful properties
    bimObjectService.getContext() // Create BIMObjectContext if it isn't already done
  ]);
  const props = promiseResults[0].valid;

  if (props.length === 0) {
    return;
  }

  const tmpTree = createTmpTree(props);
  let promises = [];

  for await (let promise of GenerateGeoContextRec(context, context, tmpTree, layout, 0)) {
    promises.push(promise);

    if (promises.length === MAX_NON_SYNCHRONIZED_NODES) {
      // eslint-disable-next-line no-await-in-loop
      await waitForFileSystem(promises);
    }
  }

  if (promises.length !== 0) {
    await waitForFileSystem(promises);
  }
}

export default GenerateGeoContext;