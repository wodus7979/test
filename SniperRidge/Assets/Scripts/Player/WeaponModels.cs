using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>1인칭 시점 무기 모델 (프리미티브 조합).</summary>
    public static class WeaponModels
    {
        static Material black, wood, tan, steel;

        static void EnsureMaterials()
        {
            if (black != null) return;
            black = ProceduralAssets.LitMaterial(new Color(0.08f, 0.08f, 0.09f), 0.45f);
            wood = ProceduralAssets.LitMaterial(new Color(0.30f, 0.20f, 0.12f), 0.3f);
            tan = ProceduralAssets.LitMaterial(new Color(0.45f, 0.40f, 0.28f), 0.25f);
            steel = ProceduralAssets.LitMaterial(new Color(0.35f, 0.36f, 0.38f), 0.6f);
        }

        /// <summary>Firearm Asset Pack 프리팹 (Resources/Weapons/Prefabs) 을 찾는다. 없으면 null.</summary>
        public static GameObject LoadPrefab(string modelName)
        {
            if (string.IsNullOrEmpty(modelName)) return null;
            return Resources.Load<GameObject>((modelName.StartsWith("launcher_") ? "Launchers/Prefabs/" : "Weapons/Prefabs/") + modelName);
        }

        /// <summary>루트 아래의 "Muzzle" 지점. 없으면 null.</summary>
        public static Transform FindMuzzle(GameObject root)
        {
            if (root == null) return null;
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
                if (t.name == "Muzzle") return t;
            return null;
        }

        public static GameObject Build(Transform parent, WeaponDefinition def)
        {
            if (def.IsTank) { var tank = Resources.Load<GameObject>(TankVehicle.Resource); return tank != null ? Object.Instantiate(tank, parent, false) : null; }
            if (def.IsMounted) return HelicopterVisual.BuildHeavyGun(parent);
            var prefab = LoadPrefab(def.ModelName);
            if (prefab != null)
            {
                var inst = Object.Instantiate(prefab, parent);
                inst.name = "WeaponModel_" + def.Id;
                inst.transform.localPosition = def.ViewOffset;
                inst.transform.localRotation = Quaternion.Euler(0f, 0f, 0f);
                inst.transform.localScale = Vector3.one;
                var lod = inst.GetComponent<LODGroup>();
                if (lod != null) lod.ForceLOD(0); // First-person equipment always uses the detailed mesh.
                foreach (var c in inst.GetComponentsInChildren<Collider>()) { c.enabled = false; Object.Destroy(c); }
                foreach (var r in inst.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = ShadowCastingMode.Off;
                return inst;
            }
            return BuildPrimitive(parent, def);
        }

        static GameObject BuildPrimitive(Transform parent, WeaponDefinition def)
        {
            EnsureMaterials();
            var root = new GameObject("WeaponModel_" + def.Id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = new Vector3(0.28f, -0.22f, 0.45f);

            switch (def.Id)
            {
                case "launcher":
                    Debug.LogWarning("[Sniper Ridge] 로켓포 에셋 누락: 로켓포 프리팹 생성 메뉴를 실행하세요.");
                    Part(root, PrimitiveType.Cylinder, new Vector3(0f, .02f, .15f), new Vector3(.16f, .48f, .16f), Quaternion.Euler(90f, 0f, 0f), tan);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -.12f, .03f), new Vector3(.05f, .18f, .08f), Quaternion.identity, black);
                    var muzzle = new GameObject("Muzzle");
                    muzzle.transform.SetParent(root.transform, false);
                    muzzle.transform.localPosition = new Vector3(0f, .02f, .63f);
                    break;
                case "dmr":
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0f, 0f), new Vector3(0.06f, 0.09f, 0.7f), Quaternion.identity, tan);
                    Part(root, PrimitiveType.Cylinder, new Vector3(0f, 0.02f, 0.7f), new Vector3(0.025f, 0.32f, 0.025f), Quaternion.Euler(90f, 0f, 0f), black);
                    Part(root, PrimitiveType.Cylinder, new Vector3(0f, 0.09f, 0.08f), new Vector3(0.045f, 0.12f, 0.045f), Quaternion.Euler(90f, 0f, 0f), black);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -0.11f, -0.02f), new Vector3(0.04f, 0.14f, 0.07f), Quaternion.Euler(-10f, 0f, 0f), black);  // 탄창
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -0.04f, -0.42f), new Vector3(0.05f, 0.11f, 0.28f), Quaternion.identity, tan);
                    break;

                case "rifle":
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0f, 0f), new Vector3(0.06f, 0.08f, 0.55f), Quaternion.identity, black);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0.01f, 0.4f), new Vector3(0.055f, 0.055f, 0.3f), Quaternion.identity, tan);   // 총열덮개
                    Part(root, PrimitiveType.Cylinder, new Vector3(0f, 0.01f, 0.66f), new Vector3(0.02f, 0.14f, 0.02f), Quaternion.Euler(90f, 0f, 0f), black);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0.075f, 0.02f), new Vector3(0.035f, 0.05f, 0.09f), Quaternion.identity, black);   // 광학 조준기
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -0.12f, 0.05f), new Vector3(0.04f, 0.16f, 0.07f), Quaternion.Euler(-12f, 0f, 0f), black);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -0.03f, -0.36f), new Vector3(0.05f, 0.1f, 0.22f), Quaternion.identity, black);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -0.1f, -0.14f), new Vector3(0.035f, 0.12f, 0.05f), Quaternion.Euler(15f, 0f, 0f), black); // 손잡이
                    break;

                case "lmg":
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0f, 0f), new Vector3(0.08f, 0.11f, 0.6f), Quaternion.identity, black);
                    Part(root, PrimitiveType.Cylinder, new Vector3(0f, 0.02f, 0.72f), new Vector3(0.03f, 0.4f, 0.03f), Quaternion.Euler(90f, 0f, 0f), steel);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0.01f, 0.3f), new Vector3(0.075f, 0.06f, 0.35f), Quaternion.identity, tan);
                    Part(root, PrimitiveType.Cube, new Vector3(-0.09f, -0.06f, 0.02f), new Vector3(0.12f, 0.12f, 0.16f), Quaternion.identity, tan);  // 탄띠 상자
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0.08f, -0.02f), new Vector3(0.03f, 0.045f, 0.08f), Quaternion.identity, black);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -0.03f, -0.4f), new Vector3(0.06f, 0.12f, 0.26f), Quaternion.identity, black);
                    // 양각대
                    Part(root, PrimitiveType.Cylinder, new Vector3(-0.05f, -0.16f, 0.62f), new Vector3(0.012f, 0.16f, 0.012f), Quaternion.Euler(0f, 0f, 20f), steel);
                    Part(root, PrimitiveType.Cylinder, new Vector3(0.05f, -0.16f, 0.62f), new Vector3(0.012f, 0.16f, 0.012f), Quaternion.Euler(0f, 0f, -20f), steel);
                    break;

                default: // sniper
                    Part(root, PrimitiveType.Cube, new Vector3(0f, 0f, 0f), new Vector3(0.06f, 0.09f, 0.8f), Quaternion.identity, wood);
                    Part(root, PrimitiveType.Cylinder, new Vector3(0f, 0.02f, 0.75f), new Vector3(0.025f, 0.35f, 0.025f), Quaternion.Euler(90f, 0f, 0f), black);
                    Part(root, PrimitiveType.Cylinder, new Vector3(0f, 0.09f, 0.1f), new Vector3(0.045f, 0.13f, 0.045f), Quaternion.Euler(90f, 0f, 0f), black);
                    Part(root, PrimitiveType.Cube, new Vector3(0f, -0.04f, -0.45f), new Vector3(0.05f, 0.11f, 0.3f), Quaternion.identity, wood);
                    break;
            }
            return root;
        }

        static void Part(GameObject root, PrimitiveType type, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
        {
            var go = GameObject.CreatePrimitive(type);
            go.transform.SetParent(root.transform, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.transform.localRotation = rot;
            var r = go.GetComponent<Renderer>();
            r.material = mat;
            r.shadowCastingMode = ShadowCastingMode.Off;
            go.GetComponent<Collider>().enabled = false;
            Object.Destroy(go.GetComponent<Collider>());
        }
    }
}
