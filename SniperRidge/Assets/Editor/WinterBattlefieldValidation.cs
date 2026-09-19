using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class WinterBattlefieldValidation
    {
        [MenuItem("Sniper Ridge/겨울 전차전 환경 검사")]
        public static void Validate()
        {
            var pine=MeshBuilder.WinterPine(new System.Random(41),1f);
            var bare=MeshBuilder.WinterBareTree(new System.Random(73),1f);
            Check(pine.subMeshCount==3&&pine.GetTriangles(2).Length>100,"침엽수 눈 메시 누락");
            Check(bare.subMeshCount==3&&bare.GetTriangles(2).Length>80,"고목 가지 눈 메시 누락");
            Check(pine.bounds.size.y>.9f&&bare.bounds.size.y>.7f,"겨울 나무 크기 오류");

            var root=new GameObject("Winter validation root").transform;
            try
            {
                var tree=Vegetation.WinterTree(root,Vector3.zero,1f,false,new System.Random(5));
                var renderer=tree.GetComponent<MeshRenderer>();
                Check(renderer!=null&&renderer.sharedMaterials.Length==3,"나무껍질·잎·눈 3중 재질 누락");
                var collider=tree.GetComponent<CapsuleCollider>();
                Check(collider!=null&&collider.enabled,"전도 나무 충돌체 누락");
                tree.name="Knock-down Snow laden pine";
                var fall=tree.AddComponent<KnockdownTree>();fall.KnockDown(Vector3.forward);
                Check(fall.IsFalling&&!collider.enabled,"눈 덮인 나무 전도/통로 개방 실패");
            }
            finally { UnityEngine.Object.DestroyImmediate(root.gameObject); }

            Check(TankCanyon.RoadDistance(TankCanyon.Node(TankCanyon.EntryNode).x,
                TankCanyon.Node(TankCanyon.EntryNode).y)<.01f,"전차 진입로 계산 오류");
            Debug.Log("[Sniper Ridge] 겨울 전차전 검사 통과: 눈 침엽수·고목·3중 재질·전도 충돌·진입로.");
        }

        static void Check(bool ok,string message)
        {
            if(!ok)throw new InvalidOperationException("[겨울 전차전 검사] "+message);
        }
    }
}
