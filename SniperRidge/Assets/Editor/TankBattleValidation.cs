using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class TankBattleValidation
    {
        [MenuItem("Sniper Ridge/전차 에셋·포탄·엄폐 검사")]
        public static void Validate()
        {
            Check(!EditorApplication.isPlayingOrWillChangePlaymode,"Play를 멈춘 뒤 검사하세요.");
            OriginalTankAssets.TankPackBuilder.BuildIfMissing();
            ValidatePrefab(TankVehicle.Resource,"k2_black_panther");
            ValidatePrefab(TankVehicle.OppositionResource,"tank_reference");
            Check(TankBattle.EnemyTankCount(1)==5&&TankBattle.EnemyTankCount(5)==9,"단계별 적 전차 수 오류");
            Check(TankBattle.EnemyAppearance(1,0)==TankAppearance.Opposition&&TankBattle.EnemyAppearance(1,1)==TankAppearance.K2BlackPanther,
                "K2와 다른 적 전차 혼합 오류");
            Check(TankVehicle.HitsRequired(TankAppearance.Opposition)==3&&TankVehicle.HitsRequired(TankAppearance.K2BlackPanther)==4,
                "전차별 직격 격파 횟수 오류");
            Check(RocketEffects.TankWreckLifetime>=15f,"격파 후 화재 지속 시간이 너무 짧습니다.");
            foreach(var name in new[]{"tank_cannon","tank_cannon_02","tank_cannon_03","tank_engine","tank_impact"})
            {
                var clip=Resources.Load<AudioClip>("Audio/"+name);
                Check(clip!=null && clip.frequency==48000 && clip.channels==2,"전차 오디오 오류: "+name);
                var importer=(AudioImporter)AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(clip));
                Check(importer.defaultSampleSettings.compressionFormat==AudioCompressionFormat.PCM,"PCM 가져오기 오류");
            }
            ValidateCollision();
            Debug.Log("[Sniper Ridge] K2/적 주력전차, 전차 전용 5단계, 오디오·사선·직격·화재 지속 검사 통과. Play에서 9번 전차를 선택하세요.");
        }
        static void ValidatePrefab(string resource,string expectedName)
        {
            var prefab=Resources.Load<GameObject>(resource);
            Check(prefab!=null&&prefab.name==expectedName,"전차 프리팹 누락/종류 오류: "+expectedName);
            Check(prefab.transform.Find("Turret/Barrel/Muzzle")!=null,"포탑/포신/총구 계층 누락: "+expectedName);
            Check(prefab.GetComponentsInChildren<BoxCollider>().Length==4,"차체/포탑/궤도 충돌체 누락: "+expectedName);
            Check(prefab.GetComponent<LODGroup>().GetLODs().Length==2,"전차 LOD 누락: "+expectedName);
            foreach(var renderer in prefab.GetComponentsInChildren<MeshRenderer>())
                foreach(var material in renderer.sharedMaterials)
                    Check(material!=null&&material.shader!=null&&material.shader.isSupported,"전차 재질/셰이더 오류: "+expectedName);
            foreach(var filter in prefab.GetComponentsInChildren<MeshFilter>())ValidateWinding(filter.sharedMesh,expectedName);
        }
        static void ValidateWinding(Mesh mesh,string expectedName)
        {
            Check(mesh!=null&&mesh.normals.Length==mesh.vertexCount,"전차 메시/노멀 누락: "+expectedName);
            var vertices=mesh.vertices;var normals=mesh.normals;
            for(int sub=0;sub<mesh.subMeshCount;sub++)
            {
                var triangles=mesh.GetTriangles(sub);
                for(int i=0;i<triangles.Length;i+=Mathf.Max(3,(triangles.Length/90/3)*3))
                {
                    int a=triangles[i],b=triangles[i+1],c=triangles[i+2];
                    Vector3 face=Vector3.Cross(vertices[b]-vertices[a],vertices[c]-vertices[a]);
                    Check(Vector3.Dot(face,normals[a]+normals[b]+normals[c])>0,"전차 외부 면 방향 오류: "+expectedName);
                }
            }
        }
        static void ValidateCollision()
        {
            Scene previous=SceneManager.GetActiveScene();
            bool batch=Application.isBatchMode;
            // A batch-mode editor starts with an unsaved untitled scene, which
            // prevents additive editor scenes from being created. Replacing the
            // empty startup scene is safe because the process quits after this
            // validation. Interactive validation remains additive so the user's
            // currently open scene is preserved.
            Scene fixture=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,
                batch?NewSceneMode.Single:NewSceneMode.Additive);
            SceneManager.SetActiveScene(fixture);
            try
            {
                Vector3 origin=new Vector3(-24000,5000,-24000);
                var visible=Dummy(origin+Vector3.forward*3);
                var hidden=Dummy(origin+Vector3.right*4);
                var far=Dummy(origin+Vector3.back*10);
                var wall=new GameObject("Cover test");wall.transform.position=origin+Vector3.right*2;
                wall.AddComponent<BoxCollider>().size=new Vector3(.3f,5,5);
                Physics.SyncTransforms();
                Check(!ArmorProjectile.Obstructed(origin,visible.transform.position,null,visible),"목표 전차를 장애물로 인식합니다.");
                Check(ArmorProjectile.Obstructed(origin,hidden.transform.position,null,hidden),"바위/벽 사선 차단 오류");
                Check(ArmorProjectile.Cast(origin,origin+Vector3.forward*20,null,out var hit) && hit.collider.GetComponentInParent<TankVehicle>()==visible,
                    "고속 포탄의 연속 경로 충돌 누락");
                var targets=ArmorProjectile.FindTankTargets(origin,160,null,true);
                Check(targets.Count==1 && targets.ContainsKey(visible) && !targets.ContainsKey(hidden) && !targets.ContainsKey(far),
                    "폭발 중복/엄폐/반경 오류");
                Check(ArmorProjectile.FindTankTargets(origin,160,null,false).Count==0,"적 포탄 아군 오사 필터 오류");
                Check(ArmorProjectile.FindTankTargets(origin,160,null,true,hidden)[hidden]==160,"직격 피해 누락");
            }
            finally
            {
                if(!batch)
                {
                    SceneManager.SetActiveScene(previous);
                    EditorSceneManager.CloseScene(fixture,true);
                }
                Physics.SyncTransforms();
            }
        }
        static TankVehicle Dummy(Vector3 position)
        {
            var go=new GameObject("Target tank");go.transform.position=position;
            var tank=go.AddComponent<TankVehicle>();
            foreach(float x in new[]{-.5f,.5f})
            {
                var child=new GameObject("Hull collider");child.transform.SetParent(go.transform,false);child.transform.localPosition=Vector3.right*x;
                child.AddComponent<BoxCollider>().size=new Vector3(1,1,1);
            }
            return tank;
        }
        static void Check(bool ok,string message) { if(!ok)throw new InvalidOperationException("[전차 검사] "+message); }
    }
}
