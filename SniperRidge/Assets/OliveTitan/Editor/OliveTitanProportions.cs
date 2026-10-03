using UnityEditor;
using UnityEngine;

namespace OliveTitanAsset
{
    // Sculpt the imported bind mesh, not the skeleton: authored run/attack clips
    // retain their joint positions, lengths and weights. Applied once per import.
    public sealed class OliveTitanProportions : AssetPostprocessor
    {
        public override uint GetVersion() => 2;

        void OnPostprocessModel(GameObject root)
        {
            if (!assetPath.StartsWith("Assets/OliveTitan/Models/OliveTitan_LOD") || !assetPath.EndsWith(".fbx")) return;
            foreach (var skin in root.GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                var mesh = skin.sharedMesh;
                var vertices = mesh.vertices;
                var normals = mesh.normals;
                var toWorld = skin.transform.localToWorldMatrix;
                var toLocal = skin.transform.worldToLocalMatrix;
                const float epsilon = .0002f;
                for (int i = 0; i < vertices.Length; i++)
                {
                    Vector3 p = toWorld.MultiplyPoint3x4(vertices[i]);
                    vertices[i] = toLocal.MultiplyPoint3x4(Sculpt(p));
                    // Preserve smooth shading at UV seams through the sculpt.
                    var jacobian = Matrix4x4.identity;
                    for (int axis = 0; axis < 3; axis++)
                    {
                        Vector3 offset = Vector3.zero; offset[axis] = epsilon;
                        jacobian.SetColumn(axis, (Sculpt(p + offset) - Sculpt(p - offset)) / (2 * epsilon));
                    }
                    Vector3 normal = toLocal.transpose.MultiplyVector(normals[i]);
                    normal = jacobian.inverse.transpose.MultiplyVector(normal);
                    normals[i] = toWorld.transpose.MultiplyVector(normal).normalized;
                }
                mesh.vertices = vertices;
                mesh.normals = normals;
                mesh.RecalculateTangents();
                mesh.RecalculateBounds();
                skin.localBounds = mesh.bounds;
            }
        }

        static float Ease(float from, float to, float value) => Mathf.SmoothStep(0, 1, Mathf.InverseLerp(from, to, value));
        static Vector3 Sculpt(Vector3 p)
        {
            Vector3 result = p;
            // Larger skull and jaw, with a continuous transition through the neck.
            // Anchor the crown at 2.30 m so feet, height and camera framing stay stable.
            float head = Ease(1.96f, 2.08f, p.y);
            result.x *= 1 + .29f * head;
            result.y += (p.y - 2.30f) * .16f * head;
            result.z = .056f + (p.z - .056f) * (1 + .20f * head);
            float neck = Ease(1.88f, 1.99f, p.y) * (1 - Ease(2.04f, 2.10f, p.y));
            float center = 1 - Ease(.18f, .32f, Mathf.Abs(p.x));
            result.x *= 1 + .10f * neck * center;
            // Reduce the overpowering shoulder/back silhouette without thinning the waist.
            float torso = Ease(1.45f, 1.76f, p.y) * (1 - Ease(1.94f, 2.09f, p.y));
            float outer = Ease(.16f, .36f, Mathf.Abs(p.x));
            result.x *= 1 - .055f * torso * outer;
            if (p.z < .015f) result.z = Mathf.Lerp(result.z, .015f + (result.z - .015f) * .94f, torso);
            // Keep the heavy waist, but taper the excessively flared upper thighs
            // and waistband together so the clothed silhouette remains V-shaped.
            float hips = Ease(.78f, 1.06f, p.y) * (1 - Ease(1.27f, 1.40f, p.y));
            result.x *= 1 - .10f * hips;
            return result;
        }
    }
}
