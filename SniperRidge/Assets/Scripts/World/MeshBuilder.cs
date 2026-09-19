using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>나무·덤불 메시를 코드로 생성한다. 서브메시 0 = 줄기, 1 = 잎.</summary>
    public static class MeshBuilder
    {
        class Buf
        {
            public readonly List<Vector3> V = new List<Vector3>();
            public readonly List<Vector2> UV = new List<Vector2>();
            public readonly List<int> Trunk = new List<int>();
            public readonly List<int> Leaf = new List<int>();
            public readonly List<int> Snow = new List<int>();
        }

        static float R(System.Random rng, float a, float b) => a + (float)rng.NextDouble() * (b - a);

        /// <summary>침엽수: 가늘어지는 줄기 + 층층이 겹친 불규칙한 원뿔 잎.</summary>
        public static Mesh Pine(System.Random rng, float height)
        {
            var b = new Buf();
            float h = height;
            AddCylinder(b, b.Trunk, Vector3.zero, Vector3.up * h * 0.9f, 0.09f * h * 0.35f, 0.02f * h * 0.35f, 7, rng, 0.06f);
            int layers = rng.Next(5, 8);
            float y0 = h * 0.22f;
            for (int i = 0; i < layers; i++)
            {
                float t = i / (float)(layers - 1);
                float yb = Mathf.Lerp(y0, h * 0.82f, t);
                float radius = Mathf.Lerp(0.34f, 0.10f, t) * h * R(rng, 0.85f, 1.15f);
                float coneH = Mathf.Lerp(0.30f, 0.20f, t) * h;
                AddCone(b, b.Leaf, new Vector3(R(rng, -0.03f, 0.03f) * h, yb, R(rng, -0.03f, 0.03f) * h), radius, coneH, 9, 3, 0.22f, 0.12f, rng);
            }
            AddCone(b, b.Leaf, new Vector3(0f, h * 0.84f, 0f), 0.06f * h, h * 0.16f, 7, 2, 0.15f, 0.05f, rng);
            return Finish(b, "Pine");
        }

        /// <summary>활엽수: 줄기 + 가지 몇 개 + 울퉁불퉁한 잎 덩어리.</summary>
        public static Mesh Broadleaf(System.Random rng, float height)
        {
            var b = new Buf();
            float h = height;
            float trunkTop = h * 0.5f;
            AddCylinder(b, b.Trunk, Vector3.zero, Vector3.up * trunkTop, 0.075f * h * 0.5f, 0.045f * h * 0.5f, 8, rng, 0.05f);
            int branches = rng.Next(3, 5);
            var tips = new List<Vector3>();
            for (int i = 0; i < branches; i++)
            {
                float ang = (i / (float)branches) * Mathf.PI * 2f + R(rng, -0.4f, 0.4f);
                Vector3 dir = new Vector3(Mathf.Cos(ang) * R(rng, 0.5f, 0.9f), R(rng, 0.7f, 1.1f), Mathf.Sin(ang) * R(rng, 0.5f, 0.9f)).normalized;
                Vector3 start = Vector3.up * (trunkTop * R(rng, 0.8f, 1.0f));
                Vector3 end = start + dir * h * R(rng, 0.28f, 0.4f);
                AddCylinder(b, b.Trunk, start, end, 0.035f * h * 0.5f, 0.012f * h * 0.5f, 6, rng, 0.03f);
                tips.Add(end);
            }
            // 잎 덩어리: 각 가지 끝 + 중앙
            foreach (var tip in tips)
            {
                float r = h * R(rng, 0.20f, 0.28f);
                AddBlob(b, b.Leaf, tip, new Vector3(r * R(rng, 0.9f, 1.3f), r * R(rng, 0.7f, 0.95f), r * R(rng, 0.9f, 1.3f)), 7, 11, 0.18f, rng);
            }
            AddBlob(b, b.Leaf, new Vector3(0f, h * 0.72f, 0f), new Vector3(h * 0.3f, h * 0.24f, h * 0.3f), 8, 12, 0.16f, rng);
            return Finish(b, "Broadleaf");
        }

        /// <summary>적이 숨는 굵은 나무: 굵고 곧은 줄기 + 높이 달린 넓은 수관.</summary>
        public static Mesh CoverTree(System.Random rng, float height, float trunkDiameter)
        {
            var b = new Buf();
            float h = height;
            float r0 = trunkDiameter * 0.5f;
            AddCylinder(b, b.Trunk, Vector3.down * 0.3f, Vector3.up * (h * 0.62f), r0 * 1.15f, r0 * 0.8f, 12, rng, 0.02f);
            for (int i = 0; i < 4; i++)
            {
                float ang = i * Mathf.PI * 0.5f + R(rng, -0.3f, 0.3f);
                Vector3 dir = new Vector3(Mathf.Cos(ang) * 0.7f, 0.9f, Mathf.Sin(ang) * 0.7f).normalized;
                Vector3 start = Vector3.up * (h * 0.58f);
                Vector3 end = start + dir * h * 0.32f;
                AddCylinder(b, b.Trunk, start, end, r0 * 0.4f, r0 * 0.15f, 7, rng, 0.02f);
                AddBlob(b, b.Leaf, end, new Vector3(h * 0.25f, h * 0.18f, h * 0.25f), 7, 11, 0.15f, rng);
            }
            AddBlob(b, b.Leaf, new Vector3(0f, h * 0.9f, 0f), new Vector3(h * 0.34f, h * 0.22f, h * 0.34f), 8, 12, 0.14f, rng);
            return Finish(b, "CoverTree");
        }

        public static Mesh Bush(System.Random rng, float size)
        {
            var b = new Buf();
            int n = rng.Next(3, 6);
            for (int i = 0; i < n; i++)
            {
                Vector3 c = new Vector3(R(rng, -0.35f, 0.35f), R(rng, 0.25f, 0.5f), R(rng, -0.35f, 0.35f)) * size;
                float r = size * R(rng, 0.35f, 0.55f);
                AddBlob(b, b.Leaf, c, new Vector3(r, r * 0.7f, r), 6, 9, 0.2f, rng);
            }
            return Finish(b, "Bush");
        }

        // ---------- 기본 도형 ----------
        public static Mesh DeadPine(System.Random rng,float height)
        {
            var b=new Buf();
            AddCylinder(b,b.Trunk,Vector3.zero,new Vector3(.25f,height,0),.23f,.055f,9,rng,.035f);
            for(int i=0;i<13;i++)
            {
                float angle=i*2.4f,y=height*(.25f+i*.048f),length=height*(.24f-i*.009f);
                var start=new Vector3(.25f*y/height,y,0);
                var tip=start+new Vector3(Mathf.Cos(angle)*length,.2f,Mathf.Sin(angle)*length);
                AddCylinder(b,b.Trunk,start,tip,.07f,.012f,6,rng,.02f);
                AddCylinder(b,b.Trunk,tip,tip+Vector3.up*.6f,.018f,.004f,5,rng,.01f);
            }
            return Finish(b,"Weathered dead pine");
        }

        /// <summary>겨울 침엽수: 짙은 잎 가장자리와 층층이 쌓인 눈을 별도 재질로 만든다.</summary>
        public static Mesh WinterPine(System.Random rng,float height)
        {
            var b=new Buf();float h=height;
            AddCylinder(b,b.Trunk,Vector3.zero,Vector3.up*h*.93f,.034f*h,.012f*h,8,rng,.045f);
            int layers=rng.Next(6,9);float y0=h*.19f;
            for(int i=0;i<layers;i++)
            {
                float t=i/(float)(layers-1),yb=Mathf.Lerp(y0,h*.79f,t);
                float radius=Mathf.Lerp(.35f,.095f,t)*h*R(rng,.9f,1.1f);
                float coneH=Mathf.Lerp(.27f,.18f,t)*h;
                Vector3 centre=new Vector3(R(rng,-.018f,.018f)*h,yb,R(rng,-.018f,.018f)*h);
                AddCone(b,b.Leaf,centre,radius,coneH,10,3,.13f,.13f,rng);
                // A shallow, slightly smaller cone exposes dark needles under the
                // snow shelf instead of turning the whole tree into a white cone.
                AddCone(b,b.Snow,centre+Vector3.up*(.018f*h),radius*.91f,coneH*.34f,10,2,.10f,.025f,rng);
            }
            AddCone(b,b.Leaf,Vector3.up*h*.80f,.075f*h,h*.20f,8,2,.1f,.03f,rng);
            AddCone(b,b.Snow,Vector3.up*h*.82f,.064f*h,h*.16f,8,2,.08f,.01f,rng);
            return Finish(b,"Snow laden pine");
        }

        /// <summary>눈이 가지 윗면에 붙은 겨울 활엽수.</summary>
        public static Mesh WinterBareTree(System.Random rng,float height)
        {
            var b=new Buf();float h=height;
            AddCylinder(b,b.Trunk,Vector3.zero,new Vector3(.015f*h,h*.58f,0),.055f*h,.028f*h,9,rng,.05f);
            int branches=rng.Next(7,10);
            for(int i=0;i<branches;i++)
            {
                float angle=i*Mathf.PI*2f/branches+R(rng,-.3f,.3f);
                Vector3 start=new Vector3(0,h*R(rng,.31f,.57f),0);
                Vector3 direction=new Vector3(Mathf.Cos(angle)*R(rng,.65f,1f),R(rng,.42f,.9f),Mathf.Sin(angle)*R(rng,.65f,1f)).normalized;
                Vector3 tip=start+direction*h*R(rng,.24f,.38f);
                AddCylinder(b,b.Trunk,start,tip,.019f*h,.006f*h,6,rng,.04f);
                AddCylinder(b,b.Snow,start+Vector3.up*.012f*h,tip+Vector3.up*.012f*h,.010f*h,.0035f*h,5,rng,.025f);
                for(int twig=0;twig<2;twig++)
                {
                    float sign=twig==0?-1f:1f;
                    Vector3 side=Vector3.Cross(direction,Vector3.up).normalized*sign;
                    Vector3 twigStart=Vector3.Lerp(start,tip,.56f+twig*.16f);
                    Vector3 twigTip=twigStart+(direction*.48f+side*.72f+Vector3.up*.38f).normalized*h*R(rng,.09f,.16f);
                    AddCylinder(b,b.Trunk,twigStart,twigTip,.007f*h,.0022f*h,5,rng,.025f);
                    AddCylinder(b,b.Snow,twigStart+Vector3.up*.009f*h,twigTip+Vector3.up*.009f*h,.004f*h,.0015f*h,5,rng,.02f);
                }
            }
            return Finish(b,"Frosted bare tree");
        }

        static void AddCylinder(Buf b, List<int> tris, Vector3 from, Vector3 to, float r0, float r1, int segs, System.Random rng, float jitter)
        {
            Vector3 axis = (to - from).normalized;
            Vector3 side = Vector3.Cross(axis, Mathf.Abs(axis.y) < 0.99f ? Vector3.up : Vector3.right).normalized;
            Vector3 side2 = Vector3.Cross(axis, side);
            int rings = 3;
            int baseIdx = b.V.Count;
            for (int ring = 0; ring <= rings; ring++)
            {
                float t = ring / (float)rings;
                Vector3 c = Vector3.Lerp(from, to, t);
                float r = Mathf.Lerp(r0, r1, t);
                for (int s = 0; s <= segs; s++)
                {
                    float a = s / (float)segs * Mathf.PI * 2f;
                    float rr = r * (1f + R(rng, -jitter, jitter));
                    b.V.Add(c + (side * Mathf.Cos(a) + side2 * Mathf.Sin(a)) * rr);
                    b.UV.Add(new Vector2(s / (float)segs * 2f, t * (to - from).magnitude * 0.5f));
                }
            }
            for (int ring = 0; ring < rings; ring++)
            {
                for (int s = 0; s < segs; s++)
                {
                    int i0 = baseIdx + ring * (segs + 1) + s;
                    int i1 = i0 + 1;
                    int i2 = i0 + segs + 1;
                    int i3 = i2 + 1;
                    tris.Add(i0); tris.Add(i2); tris.Add(i1);
                    tris.Add(i1); tris.Add(i2); tris.Add(i3);
                }
            }
        }

        static void AddCone(Buf b, List<int> tris, Vector3 basePos, float radius, float height, int segs, int rings, float jitter, float droop, System.Random rng)
        {
            int baseIdx = b.V.Count;
            for (int ring = 0; ring <= rings; ring++)
            {
                float t = ring / (float)rings;
                float r = radius * (1f - t);
                for (int s = 0; s <= segs; s++)
                {
                    float a = s / (float)segs * Mathf.PI * 2f;
                    float rr = r * (1f + R(rng, -jitter, jitter));
                    float sag = ring == 0 ? -droop * radius * R(rng, 0.3f, 1f) : 0f;
                    float y = basePos.y + height * t + sag;
                    if (ring == rings) rr = 0f;
                    b.V.Add(new Vector3(basePos.x + Mathf.Cos(a) * rr, y, basePos.z + Mathf.Sin(a) * rr));
                    b.UV.Add(new Vector2(s / (float)segs * 3f, t * 2f));
                }
            }
            for (int ring = 0; ring < rings; ring++)
            {
                for (int s = 0; s < segs; s++)
                {
                    int i0 = baseIdx + ring * (segs + 1) + s;
                    int i1 = i0 + 1;
                    int i2 = i0 + segs + 1;
                    int i3 = i2 + 1;
                    // 바깥쪽을 향하도록 (원기둥과 같은 감김 방향: 위 링이 y+ 이므로)
                    tris.Add(i0); tris.Add(i2); tris.Add(i1);
                    tris.Add(i1); tris.Add(i2); tris.Add(i3);
                }
            }
            // 바닥 뚜껑 (아래에서 올려다볼 때 구멍이 안 보이게, 아래쪽을 향하도록)
            int center = b.V.Count;
            b.V.Add(new Vector3(basePos.x, basePos.y - droop * radius * 0.3f, basePos.z));
            b.UV.Add(new Vector2(0.5f, 0.5f));
            for (int s = 0; s < segs; s++)
            {
                tris.Add(center); tris.Add(baseIdx + s); tris.Add(baseIdx + s + 1);
            }
        }

        static void AddBlob(Buf b, List<int> tris, Vector3 center, Vector3 radii, int lat, int lon, float jitter, System.Random rng)
        {
            int baseIdx = b.V.Count;
            for (int i = 0; i <= lat; i++)
            {
                float v = i / (float)lat;
                float phi = v * Mathf.PI;
                for (int j = 0; j <= lon; j++)
                {
                    float u = j / (float)lon;
                    float th = u * Mathf.PI * 2f;
                    float k = 1f + R(rng, -jitter, jitter);
                    Vector3 p = new Vector3(Mathf.Sin(phi) * Mathf.Cos(th) * radii.x, Mathf.Cos(phi) * radii.y, Mathf.Sin(phi) * Mathf.Sin(th) * radii.z) * k;
                    b.V.Add(center + p);
                    b.UV.Add(new Vector2(u * 3f, v * 2f));
                }
            }
            for (int i = 0; i < lat; i++)
            {
                for (int j = 0; j < lon; j++)
                {
                    int i0 = baseIdx + i * (lon + 1) + j;
                    int i1 = i0 + 1;
                    int i2 = i0 + lon + 1;
                    int i3 = i2 + 1;
                    tris.Add(i0); tris.Add(i1); tris.Add(i2);
                    tris.Add(i1); tris.Add(i3); tris.Add(i2);
                }
            }
        }

        static Mesh Finish(Buf b, string name)
        {
            var m = new Mesh { name = name };
            if (b.V.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.SetVertices(b.V);
            m.SetUVs(0, b.UV);
            m.subMeshCount = b.Snow.Count>0?3:2;
            m.SetTriangles(b.Trunk, 0);
            m.SetTriangles(b.Leaf, 1);
            if(b.Snow.Count>0)m.SetTriangles(b.Snow,2);
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }
    }
}
