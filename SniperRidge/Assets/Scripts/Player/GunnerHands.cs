using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Closed gloved hands: palm, four curled fingers, opposing thumb and sleeved forearm.
    /// Geometry is authored around the asset's grip markers; no independent hand drift.</summary>
    public static class GunnerHands
    {
        static Material glove, seam, sleeve;
        public static void Build(Transform grip, float side,bool includeSleeve=true)
        {
            if (glove == null)
            {
                glove = SurfaceDetail.Make(Surface.Fabric, new Color(.18f, .145f, .10f), .22f);
                seam = SurfaceDetail.Make(Surface.Rubber, new Color(.07f, .065f, .05f), .12f);
                sleeve = SurfaceDetail.Make(Surface.Fabric, new Color(.22f, .25f, .15f), .1f);
            }
            var hand = new GameObject(side < 0 ? "Left gripping hand" : "Right gripping hand").transform;
            hand.SetParent(grip, false);
            // Handle axis is Y. The palm rests on the rear/outside; fingers curl over the front.
            Ellipsoid(hand, "Glove palm", new Vector3(side * .029f, -.012f, -.024f), new Vector3(.036f, .054f, .027f), glove);
            for (int finger = 0; finger < 4; finger++)
            {
                float y = .024f - finger * .021f;
                var points = new List<Vector3>();
                for (int i = 0; i <= 12; i++)
                {
                    float angle = Mathf.Lerp(-95f, 138f, i / 12f) * Mathf.Deg2Rad;
                    points.Add(new Vector3(side * (.008f + Mathf.Cos(angle) * .037f), y, Mathf.Sin(angle) * .038f));
                }
                Tube(hand, "Curled finger " + finger, points.ToArray(), .0105f, .008f, glove);
                Ellipsoid(hand, "Knuckle pad", new Vector3(side * .036f, y, -.033f), new Vector3(.014f, .009f, .006f), seam);
            }
            Tube(hand, "Opposing thumb", new[] {
                new Vector3(side * .039f, .023f, -.043f), new Vector3(side * .016f, .05f, -.034f),
                new Vector3(-side * .014f, .046f, -.010f), new Vector3(-side * .026f, .022f, .008f)
            }, .014f, .010f, glove);
            var wrist = new Vector3(side * .043f, -.065f, -.06f);
            Vector3 wristLength=includeSleeve?new Vector3(side * .024f, -.045f, -.06f):new Vector3(side * .006f, -.012f, -.015f);
            Tube(hand, "Glove wrist", new[] { wrist, wrist + wristLength }, .035f, .039f, glove);
            if(!includeSleeve)return;
            Tube(hand, "Sleeve cuff", new[] { wrist + new Vector3(side * .02f, -.035f, -.047f), wrist + new Vector3(side * .038f, -.067f, -.095f) }, .043f, .046f, seam);
            Tube(hand, "Forearm sleeve", new[] {
                wrist + new Vector3(side * .035f, -.06f, -.085f),
                wrist + new Vector3(side * .10f, -.13f, -.24f),
                wrist + new Vector3(side * .19f, -.22f, -.43f)
            }, .046f, .064f, sleeve);
        }
        static void Ellipsoid(Transform parent, string name, Vector3 centre, Vector3 radius, Material material)
        {
            // Ring mesh shares the same smooth normal treatment as the fingers.
            var points = new Vector3[17];
            for (int i = 0; i < points.Length; i++) points[i] = centre + Vector3.up * Mathf.Lerp(-radius.y, radius.y, i / 16f);
            MakeMesh(parent, name, points, i => {
                float y = (i / 16f) * 2f - 1f;
                return new Vector2(radius.x, radius.z) * Mathf.Sqrt(Mathf.Max(.001f, 1f-y*y));
            }, material, true);
        }
        static void Tube(Transform parent, string name, Vector3[] points, float start, float end, Material material)
            => MakeMesh(parent, name, points, i => Vector2.one * Mathf.Lerp(start, end, i / (float)(points.Length-1)), material, false);
        static void MakeMesh(Transform parent, string name, Vector3[] points, System.Func<int, Vector2> radii, Material material, bool vertical)
        {
            const int sides = 12;
            var vertices = new List<Vector3>(); var uv = new List<Vector2>(); var triangles = new List<int>();
            for (int ring = 0; ring < points.Length; ring++)
            {
                Vector3 tangent = vertical ? Vector3.up : (points[Mathf.Min(ring+1, points.Length-1)] - points[Mathf.Max(0, ring-1)]).normalized;
                Vector3 right = Vector3.Cross(tangent, Mathf.Abs(tangent.y) > .95f ? Vector3.forward : Vector3.up).normalized;
                Vector3 forward = Vector3.Cross(tangent, right).normalized;
                Vector2 radius = radii(ring);
                for (int j = 0; j < sides; j++)
                {
                    float a = j * Mathf.PI * 2f / sides;
                    vertices.Add(points[ring] + right * (Mathf.Cos(a)*radius.x) + forward * (Mathf.Sin(a)*radius.y));
                    uv.Add(new Vector2(j/(float)sides, ring/(float)(points.Length-1)));
                    if (ring == 0) continue;
                    int current = ring*sides+j, next = ring*sides+(j+1)%sides;
                    triangles.AddRange(new[] { current-sides, next-sides, current, current, next-sides, next });
                }
            }
            for (int i = 1; i < sides-1; i++)
            {
                triangles.AddRange(new[] { 0, i+1, i });
                int last = (points.Length-1)*sides;
                triangles.AddRange(new[] { last, last+i, last+i+1 });
            }
            var mesh = new Mesh { name = name };
            mesh.SetVertices(vertices); mesh.SetUVs(0, uv); mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            go.GetComponent<MeshRenderer>().sharedMaterial = material;
            go.AddComponent<OwnedHandMesh>();
        }
    }
    public sealed class OwnedHandMesh : MonoBehaviour
    {
        void OnDestroy()
        {
            var filter=GetComponent<MeshFilter>();if(filter==null||filter.sharedMesh==null)return;
            if(Application.isPlaying)Destroy(filter.sharedMesh);else DestroyImmediate(filter.sharedMesh);
        }
    }
}
