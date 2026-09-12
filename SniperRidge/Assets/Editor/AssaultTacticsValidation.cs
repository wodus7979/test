using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class AssaultTacticsValidation
    {
        const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
        [MenuItem("Sniper Ridge/도시 적 회피·엄폐 판단 검사")]
        public static void Validate()
        {
            if(EditorApplication.isPlaying)throw new InvalidOperationException("Play를 멈춘 뒤 실행하세요.");
            var scene=SceneManager.CreateScene("Infantry tactics check "+Guid.NewGuid());
            NavMeshData data=null;NavMeshDataInstance instance=default;
            try
            {
                // Remote test geometry, removed in finally; does not modify the user's scene.
                Vector3 origin=new Vector3(10000,0,10000);
                var root=new GameObject("Tactics check");SceneManager.MoveGameObjectToScene(root,scene);
                root.transform.position=origin;
                Box(root.transform,"Floor",new Vector3(0,-.5f,0),new Vector3(40,1,40));
                var wall=Box(root.transform,"Cover",new Vector3(0,.9f,0),new Vector3(6,1.8f,.5f));
                Physics.SyncTransforms();
                var sources=new List<NavMeshBuildSource>();
                NavMeshBuilder.CollectSources(root.transform,EnemyRagdoll.CombatMask,NavMeshCollectGeometry.PhysicsColliders,
                    0,new List<NavMeshBuildMarkup>(),sources);
                Check(NavMesh.GetSettingsCount()>0,"NavMesh 설정 누락");
                var settings=NavMesh.GetSettingsByIndex(0);settings.agentRadius=.5f;settings.agentHeight=2.5f;
                settings.overrideVoxelSize=true;settings.voxelSize=.2f;
                data=NavMeshBuilder.BuildNavMeshData(settings,sources,new Bounds(origin,new Vector3(42,10,42)),Vector3.zero,Quaternion.identity);
                Check(data!=null,"검사 NavMesh 생성 실패");instance=NavMesh.AddNavMeshData(data);
                var actor=new GameObject("Test soldier");actor.transform.SetParent(root.transform,false);actor.transform.localPosition=new Vector3(0,0,2);
                var owner=actor.AddComponent<EnemySoldier>();owner.enabled=false;
                var navigation=actor.AddComponent<AssaultNavigation>();
                var brain=actor.AddComponent<AssaultTactics>();
                // Awake is not guaranteed in Edit mode; initialize the same cached dependencies explicitly.
                Set(brain,"owner",owner);Set(brain,"navigation",navigation);Set(brain,"side",1);
                Set(brain,"knownEye",origin+new Vector3(0,1.68f,-12));
                Check((bool)Call(brain,"Protected",actor.transform.position),"방벽 뒤를 엄폐로 인식하지 못함");
                Check(!(bool)Call(brain,"Protected",origin+new Vector3(8,0,2)),"노출된 위치를 엄폐로 오인");
                Call(brain,"Evade",Time.time);
                Check(brain.Current==AssaultTactics.Action.SeekCover,"위협 상황에서 실제 엄폐 위치를 선택하지 못함");
                var shelter=(Vector3)Get(brain,"shelter");
                Check((bool)Call(brain,"Protected",shelter),"선택한 위치가 총알을 막지 못함");
                object[] peekArgs={Vector3.zero};
                Check((bool)typeof(AssaultTactics).GetMethod("FindPeek",Private).Invoke(brain,peekArgs),"엄폐에서 사격 가능한 위치로 나올 수 없음");
                Check(!EnemyProjectile.WorldHit((Vector3)peekArgs[0]+Vector3.up*1.8f,origin+new Vector3(0,1.68f,-12),owner,out _),"내다보기 위치의 사선 차단");
                brain.Suppress(origin+new Vector3(0,1.68f,-12));
                float reaction=(float)Get(brain,"reactionAt");
                Check(reaction>=Time.time+.24f && reaction<=Time.time+.56f,"반응 지연 범위 오류");
                brain.Suppress(origin+new Vector3(0,1.68f,-12));
                Check((float)Get(brain,"reactionAt")==reaction,"연속 사격이 반응을 무기한 지연시킴");
                wall.SetActive(false);Physics.SyncTransforms();Set(brain,"hasShelter",false);
                Check(!(bool)Call(brain,"Protected",shelter),"사라진 장애물을 여전히 엄폐로 사용");
                Call(brain,"Evade",Time.time);
                Check(brain.Current==AssaultTactics.Action.Flank,"엄폐물이 없을 때 옆으로 회피하지 못함");
                Debug.Log("[Sniper Ridge] 실제 엄폐/노출 판별·엄폐 경로·사격 위치·반응 지연·엄폐 소실 시 회피 검사 통과");
            }
            finally
            {
                if(instance.valid)instance.Remove();if(data!=null)UnityEngine.Object.DestroyImmediate(data);
                EditorSceneManager.CloseScene(scene,true);
            }
        }
        static GameObject Box(Transform parent,string name,Vector3 p,Vector3 size)
        {
            var go=new GameObject(name,typeof(BoxCollider));go.transform.SetParent(parent,false);go.transform.localPosition=p;
            go.GetComponent<BoxCollider>().size=size;return go;
        }
        static object Call(object target,string name,params object[] args)=>target.GetType().GetMethod(name,Private).Invoke(target,args);
        static object Get(object target,string name)=>target.GetType().GetField(name,Private).GetValue(target);
        static void Set(object target,string name,object value)=>target.GetType().GetField(name,Private).SetValue(target,value);
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException("[적 전술 검사] "+message);}
    }
}
