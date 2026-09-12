using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class FPSWeaponsV2Validation
    {
        [MenuItem("Sniper Ridge/V2 무기 모델·손·재장전 검사")]
        public static void Validate()
        {
            Check(!EditorApplication.isPlayingOrWillChangePlaymode,"Play를 멈춘 뒤 검사하세요.");
            FPSWeaponsV2Setup.BuildIfMissing();
            foreach(string name in WeaponModels.V2Names)
            {
                var prefab=WeaponModels.LoadPrefab(name);Check(prefab!=null,"프리팹 누락: "+name);
                Check(prefab.GetComponentsInChildren<Collider>(true).Length==0,"무기 메시 충돌체가 사격을 막습니다: "+name);
                var lod=prefab.GetComponent<LODGroup>();Check(lod!=null&&lod.lodCount==2,"LOD 누락: "+name);
                foreach(var filter in prefab.GetComponentsInChildren<MeshFilter>(true))
                {
                    var mesh=filter.sharedMesh;var vertices=mesh.vertices;var normals=mesh.normals;var triangles=mesh.triangles;
                    for(int i=0;i<triangles.Length;i+=3)
                    {
                        int a=triangles[i],b=triangles[i+1],c=triangles[i+2];
                        Check(Vector3.Dot(Vector3.Cross(vertices[b]-vertices[a],vertices[c]-vertices[a]),normals[a]+normals[b]+normals[c])>0,
                            "면 방향 오류: "+mesh.name);
                    }
                    foreach(var material in filter.GetComponent<Renderer>().sharedMaterials)
                        Check(material!=null&&material.shader!=null&&material.shader.isSupported,"재질 오류: "+name);
                }
                if(name=="grenade_olive")Check(prefab.transform.Find("EffectOrigin")!=null,"수류탄 중심 누락");
                else Check(WeaponModels.FindMuzzle(prefab)!=null,"총구 누락: "+name);
            }
            foreach(var definition in WeaponDefinition.All)
            {
                if(definition.IsTank||definition.IsMounted)continue;
                CheckHands(definition);
            }
            CheckHands(WeaponDefinition.Launcher);
            var mounted=WeaponModels.LoadPrefab("mounted_machine_gun");
            Check(mounted.transform.Find("Base/YawMount/Weapon/RearGripLeft")!=null&&mounted.transform.Find("Base/YawMount/Weapon/RearGripRight")!=null,"헬기 양손 기준점 누락");
            Debug.Log("[Sniper Ridge] V2 무기 11종: 메시 면 방향·재질·LOD·총구·손 기준점·재장전 복귀·조준 정렬 검사 통과. Play에서 최종 화면을 확인하세요.");
        }
        static void CheckHands(WeaponDefinition definition)
        {
            var instance=UnityEngine.Object.Instantiate(WeaponModels.LoadPrefab(definition.ModelName));
            try
            {
                Vector3 hip=FpsWeaponView.Offset(definition,false,instance.transform);
                foreach(var filter in instance.GetComponentsInChildren<MeshFilter>(true))
                    foreach(var vertex in filter.sharedMesh.vertices)
                    {
                        Vector3 local=instance.transform.InverseTransformPoint(filter.transform.TransformPoint(vertex));
                        Vector3 cameraPoint=hip+FpsWeaponView.Rotation(false,0)*local;
                        Check(cameraPoint.z>.06f&&cameraPoint.y<.04f,"기본 자세에서 총이 눈/화면 중앙을 가립니다: "+definition.Id);
                    }
                instance.transform.SetPositionAndRotation(new Vector3(31,12,-17),Quaternion.Euler(8,53,2));
                var hands=FpsWeaponHands.Attach(instance.transform,definition);
                var parts=instance.GetComponentsInChildren<Transform>(true);var rest=new Vector3[parts.Length];
                for(int i=0;i<parts.Length;i++)rest[i]=parts[i].localPosition;
                for(int frame=0;frame<=100;frame++)hands.Pose(frame/100f,-1);
                for(int frame=0;frame<=100;frame++)hands.Pose(-1,frame/100f);
                hands.Pose(-1,-1);
                for(int i=0;i<parts.Length;i++)Check(Vector3.Distance(rest[i],parts[i].localPosition)<.001f,"재장전 후 원위치 복귀 실패: "+definition.Id+"/"+parts[i].name);
                foreach(string marker in new[]{"LeftHand","RightHand"})Check(WeaponModels.FindPart(instance.transform,marker)!=null,"손 기준점 누락: "+definition.Id);
                if(!definition.IsRocket)
                {
                    var sight=WeaponModels.FindPart(instance.transform,"SightLine");
                    Vector3 local=instance.transform.InverseTransformPoint(sight.position);
                    Vector3 aim=FpsWeaponView.Offset(definition,true,instance.transform)+local;
                    Check(new Vector2(aim.x,aim.y).magnitude<.001f&&aim.z>.1f,"조준축 정렬 오류: "+definition.Id);
                }
            }
            finally{UnityEngine.Object.DestroyImmediate(instance);}
        }
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException("[V2 무기 검사] "+message);}
    }
}
