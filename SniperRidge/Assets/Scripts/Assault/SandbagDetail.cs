using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Rounded filled cloth with closed geometry and a raised stitched seam, not a billboard.</summary>
    public static class SandbagDetail
    {
        static Material canvas,thread;
        public static void Build(Transform parent,int index,Vector3 position)
        {
            if(canvas==null)
            {
                canvas=ProceduralAssets.TexturedMaterial(new Color(.69f,.62f,.44f),Weave(),null,2f,0);
                BattlefieldScenery.Dry(canvas);
                thread=ProceduralAssets.LitMaterial(new Color(.27f,.235f,.16f),0);
            }
            var bag=new GameObject("Filled woven bag "+index).transform;bag.SetParent(parent,false);
            bag.localPosition=position;
            bag.localRotation=Quaternion.Euler(0,Mathf.Sin(index*7.3f)*3.5f,Mathf.Cos(index*1.7f)*1.2f);
            bag.localScale=new Vector3(.70f+Mathf.Sin(index*2.1f)*.018f,.275f,.56f+Mathf.Cos(index*2.7f)*.012f);
            Add(bag,TrenchGeometry.RoundedBox(12,.18f,true),canvas,"Creased sack body");
            Add(bag,Seam(),thread,"Raised stitched hem");
        }
        static void Add(Transform parent,Mesh mesh,Material material,string name)
        {
            var go=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(parent,false);
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=material;
            // The source meshes are released after UrbanProps combines the entire stack.
            go.AddComponent<UrbanMeshOwner>().Mesh=mesh;
        }
        public static Mesh Seam()
        {
            const int count=80,sides=6;
            var vertices=new List<Vector3>();var uv=new List<Vector2>();var indices=new List<int>();
            for(int i=0;i<=count;i++)
            {
                float a=i*Mathf.PI*2/count;
                var q=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));q*=.5f/Mathf.Max(Mathf.Abs(q.x),Mathf.Abs(q.z));
                var core=new Vector3(Mathf.Clamp(q.x,-.32f,.32f),0,Mathf.Clamp(q.z,-.32f,.32f));
                var radial=(q-core).normalized;
                float fold=Mathf.Sin(q.x*31f+q.z*13f)*Mathf.Sin(q.z*23f);
                var centre=core+radial*(.184f+.012f*fold);
                for(int j=0;j<=sides;j++)
                {
                    float b=j*Mathf.PI*2/sides;
                    // Small alternating swell reads as stitching along the edge in close view.
                    float radius=.0055f*(i%2==0?1.20f:.85f);
                    vertices.Add(centre+Vector3.up*Mathf.Sin(b)*radius+radial*Mathf.Cos(b)*radius);
                    uv.Add(new Vector2(i/(float)count,j/(float)sides));
                }
            }
            for(int i=0;i<count;i++)for(int j=0;j<sides;j++)
            {
                int a=i*(sides+1)+j,b=a+sides+1;
                indices.AddRange(new[]{a,a+1,b,b,a+1,b+1});
            }
            var mesh=new Mesh{name="3D sack seam"};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetTriangles(indices,0);
            mesh.RecalculateNormals();mesh.RecalculateBounds();mesh.RecalculateTangents();return mesh;
        }
        static Texture2D Weave()
        {
            const int size=512;
            var texture=new Texture2D(size,size,TextureFormat.RGB24,true){name="Dry canvas weave",wrapMode=TextureWrapMode.Repeat,anisoLevel=8};
            var colors=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++)
            {
                float warp=Mathf.Sin(x*Mathf.PI/3),weft=Mathf.Sin(y*Mathf.PI/3);
                float dirt=Mathf.PerlinNoise(x*.017f+4,y*.017f+9);
                float grain=Mathf.PerlinNoise(x*.48f,y*.48f);
                float value=.73f+.045f*warp+.045f*weft+.08f*grain-.12f*dirt;
                colors[y*size+x]=new Color(value,value*.96f,value*.86f);
            }
            texture.SetPixels(colors);texture.Apply(true,true);return texture;
        }
    }
}
