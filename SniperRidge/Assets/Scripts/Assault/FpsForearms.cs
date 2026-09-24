using UnityEngine;

namespace SniperRidge
{
    /// <summary>Cloth forearms join the glove cuffs to elbows below the view.
    /// The wrists follow animated grips, while the elbows stay relative to the camera.</summary>
    public sealed class FpsForearms : MonoBehaviour
    {
        const int Rings=49, Sides=24, Stride=Sides+1;
        Transform left,right,view;
        Mesh mesh;
        Material cloth,cuff;
        readonly Vector3[] vertices=new Vector3[2*Rings*Stride];
        readonly Vector2[] uv=new Vector2[2*Rings*Stride];
        public static FpsForearms Create(Transform weapon,Transform leftGlove,Transform rightGlove)
        {
            var go=new GameObject("Animated uniform forearms",typeof(MeshFilter),typeof(MeshRenderer));
            go.transform.SetParent(weapon,false);
            var arms=go.AddComponent<FpsForearms>();arms.left=leftGlove;arms.right=rightGlove;
            var camera=weapon.GetComponentInParent<Camera>();arms.view=camera!=null?camera.transform:null;
            arms.Build();return arms;
        }
        void Build()
        {
            cloth=SurfaceDetail.Make(Surface.Fabric,Color.white,.12f);
            cloth.name="Weathered ripstop uniform";
            cloth.mainTexture=Resources.Load<Texture2D>("Hands/sleeve_ripstop_albedo");
            cloth.SetTextureScale("_BumpMap",Vector2.one*3);
            cloth.SetFloat("_BumpScale",.20f);cloth.SetFloat("_DetailNormalMapScale",.22f);
            cuff=SurfaceDetail.Make(Surface.Fabric,new Color(.30f,.29f,.23f),.10f);
            var bodyIndices=new System.Collections.Generic.List<int>();
            var cuffIndices=new System.Collections.Generic.List<int>();
            for(int arm=0;arm<2;arm++)for(int ring=0;ring<Rings;ring++)for(int side=0;side<=Sides;side++)
            {
                int index=arm*Rings*Stride+ring*Stride+side;
                uv[index]=new Vector2(side/(float)Sides,ring/(float)(Rings-1));
                if(ring==0||side==Sides)continue;
                var indices=ring<=5?cuffIndices:bodyIndices;
                indices.AddRange(new[]{index-Stride,index-Stride+1,index,index,index-Stride+1,index+1});
            }
            mesh=new Mesh{name="Deforming uniform sleeves"};mesh.MarkDynamic();mesh.vertices=vertices;mesh.uv=uv;
            mesh.subMeshCount=2;mesh.SetTriangles(bodyIndices,0);mesh.SetTriangles(cuffIndices,1);
            GetComponent<MeshFilter>().sharedMesh=mesh;GetComponent<MeshRenderer>().sharedMaterials=new[]{cloth,cuff};
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
                Vector3 p1=wrist+direction*.075f;
                Vector3 p2=elbow+(view!=null?view.TransformDirection(new Vector3(0,.06f,.13f)):transform.parent.TransformDirection(new Vector3(0,.06f,.13f)));
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
                    // Gathered cloth has oblique, uneven folds, strongest above the cuff.
                    float envelope=Mathf.Sin(Mathf.PI*t)*(.55f+.45f*Mathf.Exp(-t*3));
                    if(ring==4||ring==5){width*=1.045f;height*=1.045f;}
                    for(int n=0;n<=Sides;n++)
                    {
                        float angle=n*Mathf.PI*2/Sides;
                        float folds=(Mathf.Sin(t*49+Mathf.Sin(angle*2)*3.3f)*.0033f+
                            Mathf.Sin(t*83-angle*3)*.0012f)*envelope;
                        float seam=.0009f*Mathf.Pow(Mathf.Max(0,Mathf.Cos(angle-.6f)),40)*Mathf.Sin(t*Mathf.PI);
                        Vector3 world=centre+x*Mathf.Cos(angle)*(width+folds+seam)+y*Mathf.Sin(angle)*(height+folds+seam);
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
            if(Application.isPlaying){Destroy(mesh);Destroy(cloth);Destroy(cuff);}
            else{DestroyImmediate(mesh);DestroyImmediate(cloth);DestroyImmediate(cuff);}
        }
    }
}
