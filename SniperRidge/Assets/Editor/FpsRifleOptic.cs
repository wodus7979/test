using System.Collections.Generic;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    // Rounded rectangular protective hood with a clear sight ray in both LODs.
    public static class FpsRifleOptic
    {
        public static Mesh Build(int lod)
        {
            var v=new List<Vector3>();var uv=new List<Vector2>();
            var triangles=new[]{new List<int>(),new List<int>(),new List<int>()};
            Vector3 center=new Vector3(.0049f,.0085f,.0026182f);
            void Quad(Vector3 a,Vector3 b,Vector3 c,Vector3 d,int material)
            {int n=v.Count;v.AddRange(new[]{a,b,c,d});uv.AddRange(new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up});triangles[material].AddRange(new[]{n,n+1,n+2,n,n+2,n+3});}
            var outer=new List<Vector2>();var inner=new List<Vector2>();
            int steps=lod==0?8:4;
            for(int corner=0;corner<4;corner++)for(int i=0;i<=steps;i++)
            {
                float angle=(corner*90+i*90f/steps)*Mathf.Deg2Rad;
                float sx=corner==0||corner==3?1:-1,sy=corner<2?1:-1;
                Vector2 arc=new Vector2(Mathf.Cos(angle),Mathf.Sin(angle));
                outer.Add(new Vector2(sx*(.058f-.014f),sy*(.052f-.014f))+arc*.014f);
                inner.Add(new Vector2(sx*(.044f-.010f),sy*(.038f-.010f))+arc*.010f);
            }
            Vector3 P(Vector2 xy,float z)=>center+new Vector3(xy.x,xy.y,z);
            for(int i=0;i<outer.Count;i++)
            {
                int j=(i+1)%outer.Count;
                Quad(P(outer[i],-.025f),P(outer[j],-.025f),P(outer[j],.040f),P(outer[i],.040f),0);
                Quad(P(inner[j],-.025f),P(inner[i],-.025f),P(inner[i],.040f),P(inner[j],.040f),1);
                Quad(P(outer[i]*.96f,-.030f),P(outer[j]*.96f,-.030f),P(outer[j],-.025f),P(outer[i],-.025f),0);
                Quad(P(inner[j]*1.03f,-.030f),P(inner[i]*1.03f,-.030f),P(inner[i],-.025f),P(inner[j],-.025f),1);
                Quad(P(outer[j]*.96f,-.030f),P(outer[i]*.96f,-.030f),P(inner[i]*1.03f,-.030f),P(inner[j]*1.03f,-.030f),0);
                Quad(P(outer[i],.040f),P(outer[j],.040f),P(inner[j],.040f),P(inner[i],.040f),0);
            }
            void Box(Vector3 c,Vector3 size,int material)
            {
                Vector3 s=size*.5f;var p=new Vector3[8];for(int i=0;i<8;i++)p[i]=c+new Vector3((i&1)==0?-s.x:s.x,(i&2)==0?-s.y:s.y,(i&4)==0?-s.z:s.z);
                Quad(p[0],p[4],p[6],p[2],material);Quad(p[5],p[1],p[3],p[7],material);Quad(p[4],p[0],p[1],p[5],material);Quad(p[2],p[6],p[7],p[3],material);Quad(p[1],p[0],p[2],p[3],material);Quad(p[4],p[5],p[7],p[6],material);
            }
            Box(new Vector3(.0049f,-.076f,.006f),new Vector3(.096f,.058f,.090f),1);
            Box(new Vector3(.0049f,-.111f,.006f),new Vector3(.104f,.014f,.119f),1);
            Box(new Vector3(.0049f,-.063f,-.041f),new Vector3(.067f,.031f,.006f),1);
            foreach(float x in new[]{-.015f,.025f})
            {
                Box(new Vector3(x,-.060f,-.046f),new Vector3(.015f,.013f,.005f),2);
                Box(new Vector3(x,-.060f,-.049f),new Vector3(.007f,.002f,.001f),1);
            }
            foreach(float x in new[]{-.032f,.042f})
            {
                // Small mounting screw heads, entirely below the window.
                Vector3 c=new Vector3(x,-.091f,-.041f);
                for(int i=0;i<12;i++)
                {
                    float a=i*Mathf.PI/6,b=(i+1)*Mathf.PI/6;
                    Vector3 A(float r,float q)=>c+new Vector3(Mathf.Cos(q)*r,Mathf.Sin(q)*r,0);
                    Quad(A(.007f,b),A(.007f,a),A(.003f,a),A(.003f,b),2);
                }
            }
            var mesh=new Mesh{name="Rifle holographic sight LOD"+lod};mesh.SetVertices(v);mesh.SetUVs(0,uv);mesh.subMeshCount=3;
            for(int i=0;i<3;i++)mesh.SetTriangles(triangles[i],i);
            mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();return mesh;
        }
    }
}
