using System;
using System.Collections.Generic;
using UnityEngine;
namespace SniperRidge
{
    /// <summary>One skinned glove, flattened palm and 15 finger bones. Hands only, no forearms.</summary>
    public sealed class FpsGlovedHand:MonoBehaviour
    {
        [Serializable] public class Part {public float[] p,n,uv,skin;public int mat;}
        [Serializable] public class Finger {public float[] closed,opened;}
        [Serializable] public class Source {public Part[] parts;public Finger[] fingers;}
        static Source source;static Material fabric,rubber;static Texture2D weave;
        readonly List<Transform> bones=new List<Transform>();float side,openness=-1;bool triggerHand;Mesh mesh;
        static Vector3 Read(float[] a,int i)=>new Vector3(a[i],a[i+1],a[i+2]);
        Vector3 Mirror(Vector3 v)=>new Vector3(v.x*side,v.y,v.z);
        public static FpsGlovedHand Create(Transform grip,float side)
        {
            var go=new GameObject("Articulated glove");go.transform.SetParent(grip,false);
            var hand=go.AddComponent<FpsGlovedHand>();hand.side=side;hand.triggerHand=side>0;hand.Build();return hand;
        }
        void Build()
        {
            if(source==null)
            {
                var asset=Resources.Load<TextAsset>("Hands/fps_glove");
                if(asset==null)throw new InvalidOperationException("FPS glove source is missing: Resources/Hands/fps_glove.json");
                source=JsonUtility.FromJson<Source>(asset.text);
            }
            if(fabric==null)
            {
                weave=new Texture2D(64,64,TextureFormat.RGB24,true){name="Glove textile weave",wrapMode=TextureWrapMode.Repeat};
                for(int y=0;y<64;y++)for(int x=0;x<64;x++)
                {float v=.78f+((x/2+y/2)%2)*.08f+Mathf.PerlinNoise(x*.8f,y*.8f)*.08f;weave.SetPixel(x,y,new Color(v,v,v));}
                weave.Apply();
                fabric=ProceduralAssets.TexturedMaterial(new Color(.26f,.23f,.18f),weave,null,1f,.02f);
                rubber=ProceduralAssets.LitMaterial(new Color(.085f,.078f,.067f),.015f);
            }
            bones.Add(transform);
            foreach(var finger in source.fingers)for(int s=0;s<3;s++)
            {
                var bone=new GameObject("Finger joint "+bones.Count).transform;bone.SetParent(transform,false);
                bone.localPosition=Mirror(Read(finger.closed,s*3));bones.Add(bone);
            }
            var vertices=new List<Vector3>();var normals=new List<Vector3>();var uv=new List<Vector2>();var skin=new List<BoneWeight>();
            var triangles=new[]{new List<int>(),new List<int>()};
            foreach(var part in source.parts)
            {
                int start=vertices.Count;
                for(int i=0;i<part.p.Length;i+=3)
                {
                    vertices.Add(Mirror(Read(part.p,i)));normals.Add(Mirror(Read(part.n,i)));int k=i/3*2;
                    uv.Add(new Vector2(part.uv[k],part.uv[k+1]));
                    skin.Add(new BoneWeight{boneIndex0=(int)part.skin[i],boneIndex1=(int)part.skin[i+1],weight0=1-part.skin[i+2],weight1=part.skin[i+2]});
                }
                for(int i=0;i<part.p.Length/3;i+=3)
                {triangles[part.mat].Add(start+i);triangles[part.mat].Add(start+i+(side<0?2:1));triangles[part.mat].Add(start+i+(side<0?1:2));}
            }
            mesh=new Mesh{name="FPS glove skinned mesh"};mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetUVs(0,uv);mesh.subMeshCount=2;
            for(int i=0;i<2;i++)mesh.SetTriangles(triangles[i],i);
            var bind=new Matrix4x4[bones.Count];for(int i=0;i<bind.Length;i++)bind[i]=bones[i].worldToLocalMatrix*transform.localToWorldMatrix;
            mesh.bindposes=bind;mesh.boneWeights=skin.ToArray();mesh.RecalculateBounds();
            var renderer=gameObject.AddComponent<SkinnedMeshRenderer>();renderer.sharedMesh=mesh;renderer.sharedMaterials=new[]{fabric,rubber};
            renderer.bones=bones.ToArray();renderer.rootBone=transform;renderer.localBounds=new Bounds(Vector3.zero,Vector3.one*.35f);renderer.updateWhenOffscreen=false;
            SetOpen(0);
        }
        public void SetOpen(float value)
        {
            value=Mathf.Clamp01(value);if(Mathf.Abs(openness-value)<.005f)return;openness=value;
            for(int f=0;f<source.fingers.Length;f++)for(int s=0;s<3;s++)
            {
                float fingerOpen=triggerHand&&f==0?Mathf.Max(.28f,value):value;
                var finger=source.fingers[f];Vector3 a=Mirror(Read(finger.closed,s*3)),b=Mirror(Read(finger.closed,(s+1)*3));
                Vector3 toA=Vector3.Lerp(a,Mirror(Read(finger.opened,s*3)),fingerOpen),toB=Vector3.Lerp(b,Mirror(Read(finger.opened,(s+1)*3)),fingerOpen);
                var bone=bones[1+f*3+s];bone.localPosition=toA;bone.localRotation=Quaternion.FromToRotation(b-a,toB-toA);
            }
        }
        void OnDestroy(){if(mesh!=null){if(Application.isPlaying)Destroy(mesh);else DestroyImmediate(mesh);}}
    }
}
