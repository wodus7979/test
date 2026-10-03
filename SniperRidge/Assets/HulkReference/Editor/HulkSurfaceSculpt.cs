using UnityEngine;
namespace HulkReferenceAssets
{
    // Rest-space shaping of the supplied continuous skin; all bone weights/UVs survive.
    public static class HulkSurfaceSculpt
    {
        static float G(float x,float width){float t=x/width;return Mathf.Exp(-t*t);}
        static Vector3 Shape(Vector3 p)
        {
            float x=Mathf.Abs(p.x),y=p.y;
            float torso=G(x,.45f)*Mathf.SmoothStep(0,1,Mathf.InverseLerp(1.42f,1.60f,y))*(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(2.24f,2.4f,y)));
            float front=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.04f,.20f,p.z));
            float back=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.03f,.19f,-p.z));
            // Flatten the oval lat plates into a tapering back, retain scapular ridges.
            float backShape=.115f*G(x-.25f,.22f)*G(y-2.04f,.29f);
            backShape+=.016f*G(x,.045f)*G(y-2.06f,.31f);
            backShape-=.013f*G(x-(.22f+(y-2.10f)*.48f),.045f)*G(y-2.17f,.17f);
            // Pectoral lower border, sternum and broad abdominal insertions.
            float chest=-.021f*G(y-(1.98f+.10f*x),.025f)*G(x-.21f,.24f);
            chest-=.012f*G(x,.030f)*G(y-2.10f,.20f);
            chest-=.023f*G(x-.23f,.18f)*G(y-2.16f,.15f);
            float abs=.018f*G(x-.115f,.090f)*(G(y-1.65f,.047f)+G(y-1.78f,.047f)+G(y-1.90f,.047f));
            abs-=.011f*G(x,.025f)*G(y-1.77f,.23f);
            float oblique=-.010f*G(x-(.24f+(y-1.60f)*.3f),.020f)*G(y-1.76f,.19f);
            p.z+=torso*(front*(chest+abs+oblique)+back*backShape);
            // Flatten spherical cheeks into cheekbone planes; leave eyelids and jaw intact.
            float cheek=G(x-.13f,.065f)*G(y-2.64f,.053f)*front;
            p.z-=.037f*cheek;
            p.x-=Mathf.Sign(p.x)*.012f*cheek;
            return p;
        }
        public static void Apply(ref Vector3 position,ref Vector3 normal)
        {
            Vector3 p=position;const float e=.0005f;
            // Transform normals with the same deformation Jacobian as the surface.
            Vector3 dx=(Shape(p+Vector3.right*e)-Shape(p-Vector3.right*e))/(2*e);
            Vector3 dy=(Shape(p+Vector3.up*e)-Shape(p-Vector3.up*e))/(2*e);
            Vector3 dz=(Shape(p+Vector3.forward*e)-Shape(p-Vector3.forward*e))/(2*e);
            var jacobian=Matrix4x4.identity;jacobian.SetColumn(0,dx);jacobian.SetColumn(1,dy);jacobian.SetColumn(2,dz);
            normal=jacobian.inverse.transpose.MultiplyVector(normal).normalized;position=Shape(p);
        }
        public static void BakeOcclusion(Mesh mesh)
        {
            var host=new GameObject("Hulk surface AO bake");var collider=host.AddComponent<MeshCollider>();collider.sharedMesh=mesh;
            var vertices=mesh.vertices;var normals=mesh.normals;var colors=new Color[vertices.Length];
            try
            {
                for(int i=0;i<vertices.Length;i++)
                {
                    var n=normals[i];var tangent=Vector3.Cross(n,Mathf.Abs(n.y)<.95f?Vector3.up:Vector3.right).normalized;
                    var bitangent=Vector3.Cross(n,tangent);float blocked=0;
                    for(int j=0;j<8;j++)
                    {
                        float angle=j*2.399963f,radius=Mathf.Sqrt((j+.5f)/8f)*.92f;
                        var ray=n*Mathf.Sqrt(1-radius*radius)+radius*(Mathf.Cos(angle)*tangent+Mathf.Sin(angle)*bitangent);
                        if(collider.Raycast(new Ray(vertices[i]+n*.005f,ray),out var hit,.30f))blocked+=1-Mathf.Clamp01(hit.distance/.30f)*.6f;
                    }
                    float ao=1-blocked/8;colors[i]=new Color(ao,ao,ao,1);
                }
                mesh.colors=colors;
            }
            finally{Object.DestroyImmediate(host);}
        }
    }
}
