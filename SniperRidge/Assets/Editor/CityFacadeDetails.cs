using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    /// <summary>Add exterior depth to the existing source geometry without closing playable doorways.</summary>
    public static class CityFacadeDetails
    {
        public static IEnumerable<CityPackSetup.Part> WithDetails(CityPackSetup.Model model)
        {
            foreach(var part in model.parts)yield return part;
            if(model.category!="building")yield break;
            var frames=new Buffer("Recessed window surrounds",6);
            var sills=new Buffer("Stone window sills",0);
            foreach(var part in model.parts)
            {
                if(part.mat!=4 && part.mat!=5)continue;
                for(int i=0;i+17<part.p.Length;i+=18)
                {
                    Vector3 normal=Read(part.n,i);
                    if(Mathf.Abs(normal.y)>.1f)continue;
                    var bounds=new Bounds(Read(part.p,i),Vector3.zero);bool planar=true;
                    for(int j=0;j<18;j+=3)
                    {
                        var n=Read(part.n,i+j);var point=Read(part.p,i+j);
                        if(Vector3.Dot(n,normal)<.99f || Mathf.Abs(Vector3.Dot(point-bounds.center,normal))>.003f)planar=false;
                        bounds.Encapsulate(point);
                    }
                    float width=Mathf.Abs(normal.z)>.9f?bounds.size.x:bounds.size.z;
                    float height=bounds.size.y;
                    if(!planar || width<.5f || height<.5f)continue;
                    Vector3 horizontal=Mathf.Abs(normal.z)>.9f?Vector3.right:Vector3.forward;
                    Vector3 depth=new Vector3(Mathf.Abs(normal.x),0,Mathf.Abs(normal.z));
                    Vector3 centre=bounds.center+normal*.028f;
                    for(int side=-1;side<=1;side+=2)
                    {
                        frames.Box(centre+horizontal*(side*(width*.5f+.025f)),horizontal*.06f+Vector3.up*(height+.12f)+depth*.09f);
                        frames.Box(centre+Vector3.up*(side*(height*.5f+.025f)),horizontal*(width+.12f)+Vector3.up*.06f+depth*.09f);
                    }
                    sills.Box(bounds.center-Vector3.up*(height*.5f+.085f)+normal*.075f,
                        horizontal*(width+.22f)+Vector3.up*.10f+depth*.22f);
                }
            }
            // Drainpipes and fixing straps add depth on otherwise flat high-rise corners.
            if(!model.enterable)
                foreach(var collider in model.colliders)
                {
                    if(collider.name!="structural_mass")continue;
                    float h=collider.size[1],w=collider.size[0],d=collider.size[2];
                    foreach(int side in new[]{-1,1})
                    {
                        var p=new Vector3(side*(w*.5f-.45f),h*.5f,-d*.5f-.09f);
                        frames.Box(p,new Vector3(.085f,h-.35f,.085f));
                        for(float y=1.4f;y<h;y+=3f)frames.Box(new Vector3(p.x,y,p.z+.025f),new Vector3(.17f,.045f,.15f));
                    }
                }
            if(frames.Count>0)yield return frames.Finish();
            if(sills.Count>0)yield return sills.Finish();
        }
        static Vector3 Read(float[] values,int i)=>new Vector3(values[i],values[i+1],values[i+2]);
        sealed class Buffer
        {
            readonly List<float> positions=new List<float>(),normals=new List<float>(),uv=new List<float>();
            readonly string name;readonly int material;
            public int Count=>positions.Count;
            public Buffer(string n,int mat){name=n;material=mat;}
            public void Box(Vector3 centre,Vector3 size)
            {
                foreach(var normal in new[]{Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back})
                {
                    var u=Vector3.Cross(Mathf.Abs(normal.y)>.5f?Vector3.forward:Vector3.up,normal).normalized;
                    var v=Vector3.Cross(normal,u);
                    Vector3 a=centre+Vector3.Scale(normal-u-v,size)*.5f,b=centre+Vector3.Scale(normal+u-v,size)*.5f,
                        c=centre+Vector3.Scale(normal+u+v,size)*.5f,d=centre+Vector3.Scale(normal-u+v,size)*.5f;
                    foreach(var point in new[]{a,b,c,a,c,d})
                    {
                        positions.Add(point.x);positions.Add(point.y);positions.Add(point.z);
                        normals.Add(normal.x);normals.Add(normal.y);normals.Add(normal.z);
                        uv.Add(Vector3.Dot(point,u));uv.Add(-Vector3.Dot(point,v));
                    }
                }
            }
            public CityPackSetup.Part Finish()=>new CityPackSetup.Part{name=name,mat=material,p=positions.ToArray(),n=normals.ToArray(),uv=uv.ToArray()};
        }
    }
}
