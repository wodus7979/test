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
            OriginalLauncherAssets.LauncherPackBuilder.BuildIfMissing();
            var prefab=Resources.Load<GameObject>(TankVehicle.Resource);
            Check(prefab!=null,"전차 프리팹 누락");
            Check(prefab.name=="k2_black_panther","K2 흑표 프리팹이 아닙니다.");
            Check(prefab.transform.Find("Turret/Barrel/Muzzle")!=null,"포탑/포신/총구 계층 누락");
            Check(prefab.GetComponentsInChildren<BoxCollider>().Length==4,"차체/포탑/궤도 충돌체 누락");
            Check(prefab.GetComponent<LODGroup>().GetLODs().Length==2,"전차 LOD 누락");
            foreach(var renderer in prefab.GetComponentsInChildren<MeshRenderer>())
                foreach(var material in renderer.sharedMaterials)
                    Check(material!=null && material.shader!=null && material.shader.isSupported,"전차 재질/셰이더 오류");
            Check(WeaponModels.LoadPrefab("launcher_reusable")!=null,"로켓병 무기 누락");
            foreach(var name in new[]{"tank_cannon","tank_cannon_02","tank_cannon_03","tank_engine","tank_impact"})
            {
                var clip=Resources.Load<AudioClip>("Audio/"+name);
                Check(clip!=null && clip.frequency==48000 && clip.channels==2,"전차 오디오 오류: "+name);
                var importer=(AudioImporter)AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(clip));
                Check(importer.defaultSampleSettings.compressionFormat==AudioCompressionFormat.PCM,"PCM 가져오기 오류");
            }
            ValidateCollision();
            Debug.Log("[Sniper Ridge] 전차 에셋·오디오·사선·엄폐·직격·폭발 중복 검사 통과. Play에서 9번 전차를 선택해 주행과 5단계를 확인하세요.");
        }
        static void ValidateCollision()
        {
            Scene previous=SceneManager.GetActiveScene();
            Scene fixture=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Additive);
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
            finally { SceneManager.SetActiveScene(previous);EditorSceneManager.CloseScene(fixture,true);Physics.SyncTransforms(); }
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
