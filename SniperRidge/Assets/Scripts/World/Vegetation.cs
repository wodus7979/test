using UnityEngine;

namespace SniperRidge
{
    /// <summary>나무, 덤불 등 식생 오브젝트 생성.</summary>
    public static class Vegetation
    {
        public enum TreeType { Pine, Broadleaf }

        static Material trunk, trunkDark, pineA, pineB, leafA, leafB, bushMat;

        static void EnsureMaterials()
        {
            if (trunk != null) return;
            trunk = ProceduralAssets.LitMaterial(new Color(0.32f, 0.23f, 0.14f), 0.05f);
            trunkDark = ProceduralAssets.LitMaterial(new Color(0.22f, 0.16f, 0.10f), 0.05f);
            pineA = ProceduralAssets.LitMaterial(new Color(0.08f, 0.24f, 0.10f), 0.05f);
            pineB = ProceduralAssets.LitMaterial(new Color(0.12f, 0.30f, 0.12f), 0.05f);
            leafA = ProceduralAssets.LitMaterial(new Color(0.18f, 0.38f, 0.14f), 0.05f);
            leafB = ProceduralAssets.LitMaterial(new Color(0.26f, 0.44f, 0.16f), 0.05f);
            bushMat = ProceduralAssets.LitMaterial(new Color(0.14f, 0.30f, 0.11f), 0.05f);
        }

        static GameObject Prim(PrimitiveType type, Transform parent, Vector3 pos, Vector3 scale, Quaternion rot, Material mat, bool collider)
        {
            var go = GameObject.CreatePrimitive(type);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.transform.localRotation = rot;
            go.GetComponent<Renderer>().material = mat;
            if (!collider) Object.Destroy(go.GetComponent<Collider>());
            return go;
        }

        /// <summary>일반 숲 나무. 소나무형은 층층이 쌓인 침엽, 활엽형은 둥근 수관.</summary>
        public static GameObject Tree(Transform parent, Vector3 pos, float s, TreeType type, System.Random rng)
        {
            EnsureMaterials();
            var root = new GameObject(type == TreeType.Pine ? "Pine" : "Tree");
            root.transform.SetParent(parent, true);
            root.transform.position = pos;
            root.transform.rotation = Quaternion.Euler(
                (float)(rng.NextDouble() * 4.0 - 2.0), (float)(rng.NextDouble() * 360.0), (float)(rng.NextDouble() * 4.0 - 2.0));
            bool alt = rng.NextDouble() < 0.5;

            if (type == TreeType.Pine)
            {
                // 줄기 (cylinder 기본 높이 2 → scale.y * 2)
                Prim(PrimitiveType.Cylinder, root.transform, new Vector3(0f, 2.4f * s, 0f), new Vector3(0.32f * s, 2.4f * s, 0.32f * s), Quaternion.identity, trunkDark, true);
                float[] heights = { 2.6f, 3.8f, 4.9f, 5.9f, 6.7f };
                float[] radii = { 2.6f, 2.2f, 1.7f, 1.2f, 0.7f };
                for (int i = 0; i < heights.Length; i++)
                {
                    float r = radii[i] * s;
                    Prim(PrimitiveType.Sphere, root.transform, new Vector3(0f, heights[i] * s, 0f),
                         new Vector3(r, r * 0.5f, r), Quaternion.identity, (alt ^ (i % 2 == 0)) ? pineA : pineB, false);
                }
            }
            else
            {
                Prim(PrimitiveType.Cylinder, root.transform, new Vector3(0f, 1.8f * s, 0f), new Vector3(0.42f * s, 1.8f * s, 0.42f * s), Quaternion.identity, trunk, true);
                Prim(PrimitiveType.Sphere, root.transform, new Vector3(0f, 4.6f * s, 0f), new Vector3(3.4f * s, 3.0f * s, 3.4f * s), Quaternion.identity, alt ? leafA : leafB, false);
                Prim(PrimitiveType.Sphere, root.transform, new Vector3(0.9f * s, 5.4f * s, 0.5f * s), new Vector3(2.2f * s, 2.0f * s, 2.2f * s), Quaternion.identity, alt ? leafB : leafA, false);
                Prim(PrimitiveType.Sphere, root.transform, new Vector3(-0.8f * s, 5.6f * s, -0.6f * s), new Vector3(2.0f * s, 1.8f * s, 2.0f * s), Quaternion.identity, leafA, false);
                Prim(PrimitiveType.Sphere, root.transform, new Vector3(0f, 6.6f * s, 0f), new Vector3(1.6f * s, 1.5f * s, 1.6f * s), Quaternion.identity, alt ? leafA : leafB, false);
            }
            return root;
        }

        /// <summary>적이 숨는 굵은 나무. 줄기 지름 trunkDiameter, 수관은 높게 달려 있어 몸통을 가리지 않는다.</summary>
        public static GameObject CoverTree(Transform parent, Vector3 pos, float trunkDiameter, float s)
        {
            EnsureMaterials();
            var root = new GameObject("CoverTree");
            root.transform.SetParent(parent, true);
            root.transform.position = pos;
            float d = trunkDiameter;
            Prim(PrimitiveType.Cylinder, root.transform, new Vector3(0f, 3.0f * s, 0f), new Vector3(d, 3.0f * s, d), Quaternion.identity, trunkDark, true);
            // 뿌리 부분을 살짝 넓게
            Prim(PrimitiveType.Cylinder, root.transform, new Vector3(0f, 0.25f * s, 0f), new Vector3(d * 1.35f, 0.25f * s, d * 1.35f), Quaternion.identity, trunkDark, false);
            Prim(PrimitiveType.Sphere, root.transform, new Vector3(0f, 7.2f * s, 0f), new Vector3(4.2f * s, 3.4f * s, 4.2f * s), Quaternion.identity, leafA, false);
            Prim(PrimitiveType.Sphere, root.transform, new Vector3(1.2f * s, 8.0f * s, 0.8f * s), new Vector3(2.6f * s, 2.2f * s, 2.6f * s), Quaternion.identity, leafB, false);
            Prim(PrimitiveType.Sphere, root.transform, new Vector3(-1.1f * s, 8.3f * s, -0.7f * s), new Vector3(2.4f * s, 2.0f * s, 2.4f * s), Quaternion.identity, leafB, false);
            return root;
        }

        public static GameObject Bush(Transform parent, Vector3 pos, float s, System.Random rng)
        {
            EnsureMaterials();
            var root = new GameObject("Bush");
            root.transform.SetParent(parent, true);
            root.transform.position = pos;
            root.transform.rotation = Quaternion.Euler(0f, (float)(rng.NextDouble() * 360.0), 0f);
            Prim(PrimitiveType.Sphere, root.transform, new Vector3(0f, 0.55f * s, 0f), new Vector3(1.8f * s, 1.1f * s, 1.6f * s), Quaternion.identity, bushMat, false);
            Prim(PrimitiveType.Sphere, root.transform, new Vector3(0.7f * s, 0.45f * s, 0.4f * s), new Vector3(1.2f * s, 0.9f * s, 1.2f * s), Quaternion.identity, bushMat, false);
            return root;
        }
    }
}
