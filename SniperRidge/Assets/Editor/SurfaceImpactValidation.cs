using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class SurfaceImpactValidation
    {
        [MenuItem("Sniper Ridge/탄흔 투영·이동·개수 제한 검사")]
        public static void Validate()
        {
            Check(EditorApplication.isPlaying,"Play 중 실행하세요.");
            var wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.name="Impact validation wall";
            wall.transform.position=new Vector3(1500,80,1500);wall.transform.localScale=new Vector3(2,2,.3f);
            try
            {
                Physics.SyncTransforms();
                var collider=wall.GetComponent<Collider>();
                Check(collider.Raycast(new Ray(wall.transform.position+new Vector3(.95f,0,-2),Vector3.forward),out var edge,4),"가장자리 명중 실패");
                SurfaceImpactMarks.Bullet(edge,.35f);
                var mark=wall.GetComponentInChildren<SurfaceImpactMark>();Check(mark!=null,"탄흔 생성 실패");
                Check(mark.GetComponent<Collider>()==null,"탄흔이 탄환/이동을 막음");
                var mesh=mark.Mesh;Check(mesh.vertexCount>=3,"탄흔 메시 없음");
                foreach(var vertex in mesh.vertices)
                {
                    Vector3 p=wall.transform.InverseTransformPoint(mark.transform.TransformPoint(vertex));
                    Check(Mathf.Abs(p.x)<=.501f&&Mathf.Abs(p.y)<=.501f,"벽 가장자리 밖으로 탄흔이 튀어나옴");
                }
                Vector3 local=mark.transform.localPosition;wall.transform.position+=new Vector3(3,1,2);wall.transform.rotation=Quaternion.Euler(0,33,0);
                Check(Vector3.Distance(mark.transform.position,wall.transform.TransformPoint(local))<.0001f,"이동 표면에 탄흔이 붙지 않음");
                int count=SurfaceImpactMarks.Current.Count;
                SurfaceImpactMarks.Explosion(new Vector3(1500,2000,1500),1);
                Check(count==SurfaceImpactMarks.Current.Count,"공중 폭발이 허공에 흔적 생성");
                wall.transform.rotation=Quaternion.identity;Physics.SyncTransforms();
                Check(collider.Raycast(new Ray(wall.transform.position+Vector3.back*2,Vector3.forward),out var hit,4),"재명중 실패");
                SurfaceImpactMarks.Explosion(hit.point+hit.normal*.12f,1);
                bool scorch=false;foreach(var item in wall.GetComponentsInChildren<SurfaceImpactMark>())if(item.name.Contains("blast"))scorch=true;
                Check(scorch,"벽 폭발 그을음 없음");
                for(int i=0;i<SurfaceImpactMarks.Capacity+5;i++)SurfaceImpactMarks.Bullet(hit);
                Check(SurfaceImpactMarks.Current.Count==SurfaceImpactMarks.Capacity,"탄흔 최대 개수 초과");
                Check(!mark.gameObject.activeSelf,"오래된 탄흔이 정리되지 않음");
                Debug.Log("[Impact validation] PASS: edge clipping, moving receiver, airburst, wall scorch, 256 mark limit");
            }
            finally{UnityEngine.Object.Destroy(wall);}
        }
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException("[Impact validation] "+message);}
    }
}
