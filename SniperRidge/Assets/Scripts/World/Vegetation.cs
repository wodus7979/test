using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>나무, 덤불 등 식생 오브젝트 생성 (MeshBuilder 로 만든 메시 + 텍스처 재질).</summary>
    public static class Vegetation
    {
        public enum TreeType { Pine, Broadleaf }

        const int Variants = 5;
        static Material trunkMat, pineMat, leafMat, bushMat, winterTrunkMat, winterPineMat, snowMat;
        static readonly List<Mesh> pineMeshes = new List<Mesh>();
        static readonly List<Mesh> leafMeshes = new List<Mesh>();
        static readonly List<Mesh> bushMeshes = new List<Mesh>();
        static readonly List<Mesh> winterPineMeshes = new List<Mesh>();
        static readonly List<Mesh> winterBareMeshes = new List<Mesh>();
        static readonly System.Random meshRng = new System.Random(4242);

        static void EnsureAssets()
        {
            if (trunkMat != null) return;
            var barkA = ProceduralAssets.LoadTex("Nature/bark_albedo");
            var barkN = ProceduralAssets.LoadTex("Nature/bark_normal");
            var leafT = ProceduralAssets.LoadTex("Nature/leaf_albedo");
            var leafN = ProceduralAssets.LoadTex("Nature/leaf_normal");
            bool tex = barkA != null;
            trunkMat = ProceduralAssets.TexturedMaterial(tex ? new Color(0.8f, 0.75f, 0.7f) : new Color(0.28f, 0.20f, 0.12f), barkA, barkN, 1f, 0.03f);
            pineMat = ProceduralAssets.TexturedMaterial(tex ? new Color(0.42f, 0.55f, 0.36f) : new Color(0.10f, 0.26f, 0.11f), leafT, leafN, 1.5f, 0.02f);
            leafMat = ProceduralAssets.TexturedMaterial(tex ? new Color(0.62f, 0.78f, 0.5f) : new Color(0.20f, 0.40f, 0.15f), leafT, leafN, 1.5f, 0.02f);
            bushMat = ProceduralAssets.TexturedMaterial(tex ? new Color(0.5f, 0.68f, 0.42f) : new Color(0.14f, 0.30f, 0.11f), leafT, leafN, 2f, 0.02f);
            winterTrunkMat=ProceduralAssets.TexturedMaterial(new Color(.39f,.31f,.23f),barkA,barkN,1.25f,.015f);
            winterPineMat=ProceduralAssets.TexturedMaterial(new Color(.105f,.19f,.13f),leafT,leafN,1.4f,.015f);
            snowMat=ProceduralAssets.TexturedMaterial(new Color(.84f,.90f,.98f),
                ProceduralAssets.NoiseTexture(64,new Color(.78f,.85f,.94f),Color.white,6f,19f),null,1.8f,.08f);

            for (int i = 0; i < Variants; i++)
            {
                pineMeshes.Add(MeshBuilder.Pine(meshRng, 1f));
                leafMeshes.Add(MeshBuilder.Broadleaf(meshRng, 1f));
                bushMeshes.Add(MeshBuilder.Bush(meshRng, 1f));
                winterPineMeshes.Add(MeshBuilder.WinterPine(meshRng,1f));
                winterBareMeshes.Add(MeshBuilder.WinterBareTree(meshRng,1f));
            }
        }

        static GameObject Make(string name, Transform parent, Vector3 pos, float yaw, float scale, Mesh mesh, Material a, Material b,Material c=null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, true);
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            go.transform.localScale = Vector3.one * scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = c==null?new[] { a, b }:new[]{a,b,c};
            return go;
        }

        /// <summary>일반 숲 나무. scale 1 ≈ 침엽수 9 m, 활엽수 8 m.</summary>
        public static GameObject Tree(Transform parent, Vector3 pos, float s, TreeType type, System.Random rng)
        {
            EnsureAssets();
            float yaw = (float)(rng.NextDouble() * 360.0);
            GameObject go;
            if (type == TreeType.Pine)
            {
                float h = 9f * s;
                go = Make("Pine", parent, pos, yaw, h, pineMeshes[rng.Next(pineMeshes.Count)], trunkMat, pineMat);
                var col = go.AddComponent<CapsuleCollider>();
                col.center = new Vector3(0f, 0.45f, 0f);
                col.radius = 0.035f;
                col.height = 0.9f;
            }
            else
            {
                float h = 8f * s;
                go = Make("Tree", parent, pos, yaw, h, leafMeshes[rng.Next(leafMeshes.Count)], trunkMat, leafMat);
                var col = go.AddComponent<CapsuleCollider>();
                col.center = new Vector3(0f, 0.25f, 0f);
                col.radius = 0.04f;
                col.height = 0.5f;
            }
            return NatureModels.Upgrade(go, type == TreeType.Pine ? (yaw < 180f ? "pine_1" : "pine_2") : (yaw < 180f ? "broadleaf_1" : "broadleaf_2"));
        }

        /// <summary>적이 숨는 굵은 나무. 줄기 지름 trunkDiameter(m), 높이 약 11 m.</summary>
        public static GameObject CoverTree(Transform parent, Vector3 pos, float trunkDiameter, float s)
        {
            EnsureAssets();
            float h = 11f * s;
            var mesh = MeshBuilder.CoverTree(meshRng, 1f, trunkDiameter / h);
            var go = Make("CoverTree", parent, pos, (float)(meshRng.NextDouble() * 360.0), h, mesh, trunkMat, leafMat);
            var col = go.AddComponent<CapsuleCollider>();
            col.center = new Vector3(0f, 0.3f, 0f);
            col.radius = trunkDiameter * 0.5f / h;
            col.height = 0.66f;
            return go;
        }

        public static GameObject Bush(Transform parent, Vector3 pos, float s, System.Random rng)
        {
            EnsureAssets();
            var go = Make("Bush", parent, pos, (float)(rng.NextDouble() * 360.0), 1.6f * s, bushMeshes[rng.Next(bushMeshes.Count)], trunkMat, bushMat);
            return NatureModels.Upgrade(go, "bush");
        }

        /// <summary>전차전 겨울 숲 전용 나무. pack LOD 대신 눈 전용 3중 재질 메시를 유지한다.</summary>
        public static GameObject WinterTree(Transform parent,Vector3 pos,float s,bool bare,System.Random rng)
        {
            EnsureAssets();float yaw=(float)rng.NextDouble()*360f;
            float h=(bare?8.4f:9.4f)*s;
            var meshes=bare?winterBareMeshes:winterPineMeshes;
            var go=Make(bare?"Frosted bare tree":"Snow laden pine",parent,pos,yaw,h,
                meshes[rng.Next(meshes.Count)],winterTrunkMat,bare?winterTrunkMat:winterPineMat,snowMat);
            var col=go.AddComponent<CapsuleCollider>();
            col.center=new Vector3(0,.42f,0);col.radius=bare?.034f:.03f;col.height=.84f;
            return go;
        }
    }
}
