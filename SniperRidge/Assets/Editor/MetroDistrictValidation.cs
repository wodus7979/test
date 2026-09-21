using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class MetroDistrictValidation
    {
        [MenuItem("Sniper Ridge/메트로 도시 외형·출입구 검사")]
        public static void Validate()
        {
            // Runtime check uses the actual baked district and its shared generated meshes.
            if(!EditorApplication.isPlaying || GameManager.Instance==null || GameManager.Instance.Mission!=MissionType.Assault)
                throw new InvalidOperationException("도시 FPS 작전 Play 중 실행하세요.");
            var world=UnityEngine.Object.FindObjectOfType<AssaultWorld>();
            var district=world.GetComponentInChildren<MetroDistrictArchitecture>();
            Check(district!=null,"메트로 외형 누락");
            var meshes=new HashSet<Mesh>();int buildings=0,portals=0,faces=0;
            foreach(Transform block in world.transform)
            {
                var exterior=block.Find("Metro modular exterior");if(exterior==null)continue;
                buildings++;
                Check(block.GetComponent<Renderer>().forceRenderingOff,"원래 외형이 겹쳐 보임");
                Check(exterior.GetComponentsInChildren<Collider>().Length==0,"장식에 이동 방해 충돌체 추가됨");
                var lod=exterior.GetComponent<LODGroup>().GetLODs();Check(lod.Length==2,"거리별 외형 누락");
                var near=lod[0].renderers[0].GetComponent<MeshFilter>().sharedMesh;
                var far=lod[1].renderers[0].GetComponent<MeshFilter>().sharedMesh;
                Check(far.vertexCount<near.vertexCount,"먼거리 메시가 간소화되지 않음");
                foreach(var mesh in new[]{near,far})
                {
                    if(!meshes.Add(mesh))continue;
                    var p=mesh.vertices;var n=mesh.normals;var t=mesh.triangles;
                    for(int i=0;i<t.Length;i+=3)
                    {
                        Check(Vector3.Dot(Vector3.Cross(p[t[i+1]]-p[t[i]],p[t[i+2]]-p[t[i]]),n[t[i]])>0,"뒤집힌 외벽: "+mesh.name);
                        faces++;
                    }
                }
                foreach(var collider in block.GetComponentsInChildren<BoxCollider>())
                {
                    if(!collider.name.StartsWith("floor"))continue;
                    float depth=collider.size.z;
                    // Both entrances have an open 4 m doorway in the source collision shell.
                    foreach(int sign in new[]{-1,1})
                    {
                        var origin=new Vector3(0,1.6f,sign*(depth*.5f+1));var direction=Vector3.forward*-sign;
                        Check(!Hits(near,origin,direction,2f),"새 외벽이 출입구를 가림: "+block.name);
                        Check(!Physics.Raycast(block.TransformPoint(origin),block.TransformDirection(direction),2f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore),"출입구 충돌: "+block.name);
                        portals++;
                    }
                }
            }
            Check(buildings==AssaultLayout.Data.buildings.Length,"일부 건물 교체 누락");
            AssaultWorld.ValidateNavigation();
            Debug.Log($"[Metro validation] PASS buildings={buildings}, portals={portals}, uniqueMeshes={meshes.Count}, outwardTriangles={faces}; 왕/증원 경로 연결됨");
        }
        static bool Hits(Mesh mesh,Vector3 origin,Vector3 direction,float maxDistance)
        {
            var v=mesh.vertices;var indices=mesh.triangles;
            for(int i=0;i<indices.Length;i+=3)
            {
                var a=v[indices[i]];var e1=v[indices[i+1]]-a;var e2=v[indices[i+2]]-a;
                var h=Vector3.Cross(direction,e2);float det=Vector3.Dot(e1,h);if(Mathf.Abs(det)<.000001f)continue;
                float inverse=1/det;var s=origin-a;float u=inverse*Vector3.Dot(s,h);if(u<0||u>1)continue;
                var q=Vector3.Cross(s,e1);float w=inverse*Vector3.Dot(direction,q);if(w<0||u+w>1)continue;
                float distance=inverse*Vector3.Dot(e2,q);if(distance>=0&&distance<=maxDistance)return true;
            }
            return false;
        }
        static void Check(bool condition,string message){if(!condition)throw new InvalidOperationException("[Metro validation] "+message);}
    }
}
