using UnityEngine;

namespace SniperRidge
{
    /// <summary>Bare forearms join the glove cuffs to elbows below the view.
    /// The support arm follows the wrist axis; the trigger elbow stays below the camera.</summary>
    public sealed class FpsForearms : MonoBehaviour
    {
        const int Rings=49, Sides=24, Stride=Sides+1;
        Transform left,right,view;
        Mesh mesh;
        Material skin,cuff;
        readonly Vector3[] vertices=new Vector3[2*Rings*Stride];
        readonly Vector2[] uv=new Vector2[2*Rings*Stride];
        public static FpsForearms Create(Transform weapon,Transform leftGlove,Transform rightGlove)
        {
            var go=new GameObject("Animated bare forearms",typeof(MeshFilter),typeof(MeshRenderer));
            go.transform.SetParent(weapon,false);
            var arms=go.AddComponent<FpsForearms>();arms.left=leftGlove;arms.right=rightGlove;
            var camera=weapon.GetComponentInParent<Camera>();arms.view=camera!=null?camera.transform:null;
            arms.Build();return arms;
        }
        void Build()
        {
            skin=SurfaceDetail.Make(Surface.Skin,new Color(.62f,.40f,.27f),.30f,0);
            skin.name="Warm skin with fine pores";
            skin.SetTextureScale("_BumpMap",Vector2.one*2);
            skin.SetFloat("_BumpScale",.12f);skin.SetFloat("_DetailNormalMapScale",.12f);
            cuff=SurfaceDetail.Make(Surface.Fabric,new Color(.38f,.29f,.18f),.10f);
            var bodyIndices=new System.Collections.Generic.List<int>();
            var cuffIndices=new System.Collections.Generic.List<int>();
            for(int arm=0;arm<2;arm++)for(int ring=0;ring<Rings;ring++)for(int side=0;side<=Sides;side++)
            {
                int index=arm*Rings*Stride+ring*Stride+side;
                uv[index]=new Vector2(side/(float)Sides,ring/(float)(Rings-1));
                if(ring==0||side==Sides)continue;
                var indices=ring<=3?cuffIndices:bodyIndices;
                indices.AddRange(new[]{index-Stride,index-Stride+1,index,index,index-Stride+1,index+1});
            }
            mesh=new Mesh{name="Deforming anatomical forearms"};mesh.MarkDynamic();mesh.vertices=vertices;mesh.uv=uv;
            mesh.subMeshCount=2;mesh.SetTriangles(bodyIndices,0);mesh.SetTriangles(cuffIndices,1);
            GetComponent<MeshFilter>().sharedMesh=mesh;GetComponent<MeshRenderer>().sharedMaterials=new[]{skin,cuff};
            UpdatePose();
        }
        public void UpdatePose()
        {
            if(mesh==null)return;
            for(int arm=0;arm<2;arm++)
            {
                float side=arm==0?-1:1;var glove=arm==0?left:right;
                Vector3 wrist=glove.TransformPoint(new Vector3(side*.044f,-.004f,-.080f));
                // Camera-space endpoints are below the bottom edge at both hip and ADS FOV.
                // Editor model checks without a camera use the weapon's axes instead.
                Vector3 elbow=view!=null?view.TransformPoint(new Vector3(side*.43f,-.65f,.14f)):
                    transform.parent.TransformPoint(new Vector3(side*.34f,-.42f,-.35f));
                Vector3 direction=glove.TransformDirection(Vector3.back);
                // The support forearm continues the glove's wrist axis. Anchoring it to the
                // left edge of the camera bent the wrist and flared the whole arm sideways.
                if(arm==0)elbow=wrist+direction*.72f;
                Vector3 p1=arm==0?Vector3.Lerp(wrist,elbow,1f/3f):wrist+direction*.075f;
                Vector3 p2=elbow+(view!=null?view.TransformDirection(new Vector3(0,.06f,.13f)):transform.parent.TransformDirection(new Vector3(0,.06f,.13f)));
                if(arm==0)p2=Vector3.Lerp(wrist,elbow,2f/3f);
                Vector3 previousRight=glove.right;
                for(int ring=0;ring<Rings;ring++)
                {
                    float t=ring/(float)(Rings-1),u=1-t;
                    Vector3 centre=u*u*u*wrist+3*u*u*t*p1+3*u*t*t*p2+t*t*t*elbow;
                    Vector3 tangent=(3*u*u*(p1-wrist)+6*u*t*(p2-p1)+3*t*t*(elbow-p2)).normalized;
                    Vector3 x=Vector3.ProjectOnPlane(previousRight,tangent).normalized;
                    if(x.sqrMagnitude<.1f)x=Vector3.Cross(tangent,Vector3.up).normalized;
                    previousRight=x;Vector3 y=Vector3.Cross(tangent,x).normalized;
                    float width=Mathf.Lerp(.025f,.061f,Mathf.SmoothStep(0,1,t));
                    float height=Mathf.Lerp(.034f,.055f,Mathf.SmoothStep(0,1,t));
                    // Low tendons blend into the forearm muscle; no cloth folds on exposed skin.
                    float envelope=Mathf.Sin(Mathf.PI*t)*(.55f+.45f*Mathf.Exp(-t*3));
                    if(ring==2||ring==3){width*=1.045f;height*=1.045f;}
                    for(int n=0;n<=Sides;n++)
                    {
                        float angle=n*Mathf.PI*2/Sides;
                        float muscle=Mathf.Cos(angle*2+.3f)*.002f*envelope;
                        float tendon=.0007f*Mathf.Pow(Mathf.Max(0,Mathf.Cos(angle-.6f-t*.3f)),30)*Mathf.Sin(t*Mathf.PI);
                        Vector3 world=centre+x*Mathf.Cos(angle)*(width+muscle+tendon)+y*Mathf.Sin(angle)*(height+muscle+tendon);
                        vertices[arm*Rings*Stride+ring*Stride+n]=transform.InverseTransformPoint(world);
                    }
                }
            }
            mesh.vertices=vertices;mesh.RecalculateNormals();
            // UV seam vertices occupy the same place and must share their shading normal.
            var normals=mesh.normals;
            for(int arm=0;arm<2;arm++)for(int ring=0;ring<Rings;ring++)
            {
                int a=arm*Rings*Stride+ring*Stride,b=a+Sides;
                normals[a]=normals[b]=(normals[a]+normals[b]).normalized;
            }
            mesh.normals=normals;mesh.RecalculateTangents();mesh.RecalculateBounds();
        }
        void OnDestroy()
        {
            if(Application.isPlaying){Destroy(mesh);Destroy(skin);Destroy(cuff);}
            else{DestroyImmediate(mesh);DestroyImmediate(skin);DestroyImmediate(cuff);}
        }
    }
}
