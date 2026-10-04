using System.Collections.Generic;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    // Open optical housing: no opaque lens disk crosses the actual sight ray.
    public static class FpsRifleOptic
    {
        public static Mesh Build(int lod)
        {
            var v=new List<Vector3>();var uv=new List<Vector2>();var t=new List<int>();
            Vector3 center=new Vector3(.0049f,.0085f,.0026182f);int sides=lod==0?64:32;
            void Quad(Vector3 a,Vector3 b,Vector3 c,Vector3 d)
            {int n=v.Count;v.AddRange(new[]{a,b,c,d});uv.AddRange(new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up});t.AddRange(new[]{n,n+1,n+2,n,n+2,n+3});}
            Vector3 Ring(float angle,float radius,float z)=>center+new Vector3(Mathf.Cos(angle)*radius,Mathf.Sin(angle)*radius,z);
            float[] z={-.088f,-.082f,-.063f,.049f,.072f,.085f};float[] r={.039f,.041f,.035f,.034f,.041f,.039f};const float inner=.030f;
            for(int i=0;i<sides;i++)
            {
                float a=i*Mathf.PI*2/sides,b=(i+1)*Mathf.PI*2/sides;
                for(int j=0;j<z.Length-1;j++)
                {
                    Quad(Ring(a,r[j],z[j]),Ring(b,r[j],z[j]),Ring(b,r[j+1],z[j+1]),Ring(a,r[j+1],z[j+1]));
                    Quad(Ring(b,inner,z[j]),Ring(a,inner,z[j]),Ring(a,inner,z[j+1]),Ring(b,inner,z[j+1]));
                }
                Quad(Ring(b,r[0],z[0]),Ring(a,r[0],z[0]),Ring(a,inner,z[0]),Ring(b,inner,z[0]));
                int last=z.Length-1;Quad(Ring(a,r[last],z[last]),Ring(b,r[last],z[last]),Ring(b,inner,z[last]),Ring(a,inner,z[last]));
            }
            void Box(Vector3 c,Vector3 size)
            {
                Vector3 s=size*.5f;var p=new Vector3[8];for(int i=0;i<8;i++)p[i]=c+new Vector3((i&1)==0?-s.x:s.x,(i&2)==0?-s.y:s.y,(i&4)==0?-s.z:s.z);
                Quad(p[0],p[4],p[6],p[2]);Quad(p[5],p[1],p[3],p[7]);Quad(p[4],p[0],p[1],p[5]);Quad(p[2],p[6],p[7],p[3]);Quad(p[1],p[0],p[2],p[3]);Quad(p[4],p[5],p[7],p[6]);
            }
            Box(new Vector3(.0049f,-.111f,0),new Vector3(.053f,.014f,.113f));
            foreach(float depth in new[]{-.037f,.037f})Box(new Vector3(.0049f,-.069f,depth),new Vector3(.029f,.079f,.016f));
            // Adjustment turret is above the optical axis, not in the clear aperture.
            Box(new Vector3(.0049f,.054f,.005f),new Vector3(.020f,.017f,.023f));
            var mesh=new Mesh{name="Rifle clear optic LOD"+lod};mesh.SetVertices(v);mesh.SetUVs(0,uv);mesh.SetTriangles(t,0);mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();return mesh;
        }
    }
}
