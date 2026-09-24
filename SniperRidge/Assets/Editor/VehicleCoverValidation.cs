using System;
using UnityEditor;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public static class VehicleCoverValidation
    {
        [MenuItem("Sniper Ridge/차량 보닛·차체 사선 검사")]
        public static void Validate()
        {
            if(!EditorApplication.isPlaying)throw new InvalidOperationException("Play 중 실행하세요.");
            var root=new GameObject("Vehicle cover validation");
            try
            {
                foreach(string kind in new[]{"Abandoned sedan","Utility van"})foreach(float yaw in new[]{0f,41f})
                {
                    var vehicle=UrbanProps.Place(kind,root.transform,new Vector3(1500,50,1500),yaw);
                    Physics.SyncTransforms();
                    Check(vehicle.GetComponent<MeshCollider>()?.sharedMesh==vehicle.GetComponent<MeshFilter>().sharedMesh,"차량 외형/충돌 불일치");
                    Check(!Hit(vehicle.transform,1.25f,1.8f),"보닛 위 빈 공간이 탄환을 막음: "+kind);
                    Check(Hit(vehicle.transform,.55f,1.8f),"차체가 탄환을 통과시킴: "+kind);
                    Check(Hit(vehicle.transform,1.25f,0f),"실내/지붕이 탄환을 통과시킴: "+kind);
                    vehicle.SetActive(false);UnityEngine.Object.Destroy(vehicle);
                }
                Debug.Log("[Vehicle cover] PASS: sedan/van, rotated hull, clear bonnet, solid body and cabin.");
            }
            finally{UnityEngine.Object.Destroy(root);}
        }
        static bool Hit(Transform vehicle,float height,float z)
        {
            var origin=vehicle.TransformPoint(new Vector3(-3,height,z));
            return Physics.Raycast(origin,vehicle.right,out var hit,6,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)&&hit.collider.transform.IsChildOf(vehicle);
        }
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
    }
}
