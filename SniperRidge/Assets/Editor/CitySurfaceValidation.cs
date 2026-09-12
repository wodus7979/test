using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class CitySurfaceValidation
    {
        [MenuItem("Sniper Ridge/도시 외벽·도로·모래주머니 검사")]
        public static void Validate()
        {
            Check(!EditorApplication.isPlayingOrWillChangePlaymode,"Play를 멈추고 검사하세요.");
            CityPackSetup.BuildIfMissing();
            int faces=0;
            foreach(var name in CityBattlefield.RequiredModels)
            {
                var prefab=Resources.Load<GameObject>("CityPack/Prefabs/"+name);
                Check(prefab!=null,"프리팹 누락: "+name);
                var mesh=prefab.GetComponent<MeshFilter>().sharedMesh;
                var p=mesh.vertices;var n=mesh.normals;var t=mesh.triangles;
                for(int i=0;i<t.Length;i+=3)
                {
                    var cross=Vector3.Cross(p[t[i+1]]-p[t[i]],p[t[i+2]]-p[t[i]]);
                    Check(Vector3.Dot(cross,n[t[i]]+n[t[i+1]]+n[t[i+2]])>0,"외벽/표면 앞뒤 뒤집힘: "+name+" triangle "+i/3);
                    faces++;
                }
            }
            var terrain=Resources.Load<Material>("CityPack/Materials/DryTerrain");
            var stone=Resources.Load<Material>("CityPack/Materials/AgedStone");
            Check(stone!=null && stone.mainTexture!=null,"석재 외벽 질감 누락");
            Check(Resources.Load<Texture2D>("CityPack/Textures/asphalt_urban")!=null,"새 무광 아스팔트 질감 누락");
            Check(Resources.Load<Material>("CityPack/Materials/Window_Glass").mainTexture!=null,"창문 커튼/블라인드 아틀라스 누락");
            Check(terrain!=null && terrain.shader.name=="Nature/Terrain/Diffuse","도로 지형 정반사 차단 재질 누락");
            foreach(var name in new[]{"Asphalt","Sidewalk","White_Paint","Yellow_Paint"})
            {
                var mat=Resources.Load<Material>("CityPack/Materials/"+name);
                Check(mat.GetFloat("_Metallic")==0 && mat.GetFloat("_Glossiness")==0 && mat.IsKeywordEnabled("_SPECULARHIGHLIGHTS_OFF"),"도로 소품 재질 반사: "+name);
            }
            var bag=TrenchGeometry.RoundedBox(12,.18f,true);var seam=SandbagDetail.Seam();
            try
            {
                Check(bag.vertexCount>1000 && bag.bounds.size.y>.9f,"모래주머니 입체 메시 누락");
                Check(seam.vertexCount>400 && seam.bounds.size.x>.98f && seam.bounds.size.z>.98f,"돌출 봉제선 누락");
            }
            finally{UnityEngine.Object.DestroyImmediate(bag);UnityEngine.Object.DestroyImmediate(seam);}
            Debug.Log("[Sniper Ridge] 도시 표면 검사 통과: "+faces+"개 삼각형의 앞면/법선 일치, 무광 도로, 입체 모래주머니/봉제선. 실제 화면은 Play에서 확인하세요.");
        }
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException("[도시 표면 검사] "+message);}
    }
}
