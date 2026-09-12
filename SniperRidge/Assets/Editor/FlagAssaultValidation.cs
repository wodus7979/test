using System;
using UnityEditor;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public static class FlagAssaultValidation
    {
        [MenuItem("Sniper Ridge/도시 분대 이동·사격 현황")]
        public static void Combat()
        {
            var game=GameManager.Instance;
            if(!EditorApplication.isPlaying||game==null||game.Assault==null)throw new InvalidOperationException("도시 FPS Play에서 실행하세요.");
            game.Assault.ReportCombat();
        }
        [MenuItem("Sniper Ridge/FPS 손·탄창 재장전 검사")]
        public static void Hands()
        {
            if(EditorApplication.isPlaying)throw new InvalidOperationException("Play를 멈춘 뒤 실행하세요.");
            var cameraObject=new GameObject("Temporary hand inspection camera");
            try
            {
                var camera=cameraObject.AddComponent<Camera>();camera.fieldOfView=72;camera.aspect=16f/9f;camera.nearClipPlane=.03f;
                foreach(string id in new[]{"urban_rifle","lmg","sniper","launcher"})
                {
                    var definition=id=="launcher"?WeaponDefinition.Launcher:WeaponDefinition.Find(id);
                    var model=WeaponModels.Build(camera.transform,definition);
                    try
                    {
                        model.transform.localPosition=new Vector3(.13f,-.085f,.60f);
                        var pose=FpsWeaponHands.Attach(model.transform,definition);
                        foreach(string hand in new[]{"Trigger hand","Support and loading hand"})
                        {
                            var renderer=model.transform.Find(hand).GetComponentInChildren<Renderer>();
                            var point=camera.WorldToViewportPoint(renderer.bounds.center);
                            Check(point.z>.03f&&point.x>0&&point.x<1&&point.y>0&&point.y<1,id+" 손이 화면 밖에 있음: "+hand);
                        }
                        var left=model.transform.Find("Support and loading hand");Vector3 rest=left.localPosition;
                        pose.Pose(.4f,-1);Check(Vector3.Distance(left.localPosition,rest)>.12f,id+" 장전 손 이동 누락");
                        var magazine=model.transform.Find(definition.IsRocket?"Reload round":id=="lmg"?"AmmoBox":"Magazine");
                        Check(magazine!=null,id+" 분리 탄창/탄약 메시 누락 — 총기 프리팹을 재생성하세요");
                        var lowered=magazine.localPosition;pose.Pose(-1,-1);
                        Check(Vector3.Distance(magazine.localPosition,lowered)>.15f,id+" 탄창 분리/삽입 동작 누락");
                        Check(Vector3.Distance(left.localPosition,rest)<.001f,id+" 장전 후 손 복귀 실패");
                    }
                    finally{UnityEngine.Object.DestroyImmediate(model);}
                }
                Debug.Log("[Sniper Ridge] 4종 무기 양손 화면 포함·탄창 이동·장전 후 복귀 검사 통과");
            }
            finally{UnityEngine.Object.DestroyImmediate(cameraObject);}
        }
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
    }
}
