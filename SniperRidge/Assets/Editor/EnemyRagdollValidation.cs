using System;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class EnemyRagdollValidation
    {
        [MenuItem("Sniper Ridge/적 쓰러짐 물리 검사 (Play 중)")]
        public static void Validate()
        {
            if (!EditorApplication.isPlaying)
                throw new InvalidOperationException("Play를 시작한 뒤 검사하세요. 별도의 물리 씬에서 검사합니다.");
            var prefab = Resources.Load<GameObject>("Enemies/SoldierModel");
            Check(prefab != null, "병사 프리팹이 없습니다.");
            var clips = AssetDatabase.LoadAllAssetsAtPath("Assets/EnemyModel/Soldier.fbx").OfType<AnimationClip>()
                .Where(c => !c.name.StartsWith("__preview__")).ToArray();
            AnimationClip idle = clips.First(c => c.name.ToLowerInvariant().Contains("idle"));
            AnimationClip run = clips.First(c => c.name.ToLowerInvariant().Contains("run"));
            var savedRandom = UnityEngine.Random.state;
            // Local scene simulation never steps the running mission's physics world.
            var scene = SceneManager.CreateScene("Ragdoll validation", new CreateSceneParameters(LocalPhysicsMode.Physics3D));
            try
            {
                PhysicsScene physics = scene.GetPhysicsScene();
                Check(physics.IsValid() && !physics.Equals(Physics.defaultPhysicsScene), "격리된 물리 씬을 만들지 못했습니다.");
                for (int scenario = 0; scenario < 4; scenario++)
                {
                    float scale = scenario % 2 == 0 ? 1.5f : 2f;
                    var ground = new GameObject("ValidationGround"); SceneManager.MoveGameObjectToScene(ground, scene);
                    var floor = ground.AddComponent<BoxCollider>(); floor.size = new Vector3(80f, 1f, 80f);
                    ground.transform.position = Vector3.down * .5f;
                    if (scenario == 3) ground.transform.rotation = Quaternion.Euler(0f, 0f, 12f);
                    var owner = new GameObject("ValidationSoldier"); SceneManager.MoveGameObjectToScene(owner, scene);
                    try
                    {
                        owner.transform.localScale = Vector3.one * scale;
                        var wrapper = new GameObject("ModelRoot").transform; wrapper.SetParent(owner.transform, false);
                        wrapper.localRotation = Quaternion.Euler(0f, EnemyModels.YawOffset, 0f);
                        var model = UnityEngine.Object.Instantiate(prefab, wrapper);
                        foreach (var behaviour in model.GetComponentsInChildren<MonoBehaviour>()) behaviour.enabled = false;
                        var animator = model.GetComponent<Animator>(); animator.enabled = false;
                        var renderers = model.GetComponentsInChildren<SkinnedMeshRenderer>();
                        Bounds bounds = renderers[0].bounds;
                        foreach (var renderer in renderers) bounds.Encapsulate(renderer.bounds);
                        wrapper.localScale = Vector3.one * (1.85f * scale / bounds.size.y);
                        var clip = scenario == 1 ? run : idle;
                        clip.SampleAnimation(model, clip.length * .37f);
                        Transform hips = EnemyRagdoll.FindBone(model.transform, "Hips");
                        if (scenario == 2)
                        {
                            var left = EnemyRagdoll.FindBone(model.transform, "LeftFoot");
                            var right = EnemyRagdoll.FindBone(model.transform, "RightFoot");
                            Vector3 leftTarget = left.position, rightTarget = right.position;
                            hips.position -= Vector3.up * (.5f * scale);
                            foreach (string side in new[] { "Left", "Right" })
                                EnemyAnimationRig.SolveLimb(EnemyRagdoll.FindBone(model.transform, side + "UpLeg"),
                                    EnemyRagdoll.FindBone(model.transform, side + "Leg"), EnemyRagdoll.FindBone(model.transform, side + "Foot"),
                                    side == "Left" ? leftTarget : rightTarget, owner.transform.position + Vector3.forward * scale);
                        }
                        var held = new GameObject("ValidationRifle").transform;
                        held.SetParent(EnemyRagdoll.FindBone(model.transform, "RightHand"), false);
                        held.position = held.parent.position;
                        held.rotation = owner.transform.rotation;
                        held.localScale = Vector3.one / Mathf.Max(.0001f, held.parent.lossyScale.x);
                        float originalHipHeight = hips.position.y;
                        var ragdoll = EnemyRagdoll.Begin(model.transform, owner.transform, held,
                            scenario == 1 ? Vector3.forward * (4.5f * scale) : Vector3.zero,
                            scenario % 2 == 0 ? Vector3.back : Vector3.right, scenario == 3);
                        Check(ragdoll != null && ragdoll.PhysicsBodyCount == EnemyRagdoll.BodyCount, "15개 신체 물리 연결 누락");
                        var bodies = ragdoll.GetComponentsInChildren<Rigidbody>();
                        Check(bodies.Length == 16, "떨어지는 소총 물리 연결 누락");
                        var joints = ragdoll.GetComponentsInChildren<ConfigurableJoint>();
                        Check(joints.Length == 14, "관절 수 오류");
                        foreach (var body in bodies) body.interpolation = RigidbodyInterpolation.None;
                        foreach (var joint in joints)
                            Check(Vector3.Distance(joint.transform.TransformPoint(joint.anchor),
                                joint.connectedBody.transform.TransformPoint(joint.connectedAnchor)) < .005f, "초기 관절이 떨어져 있습니다.");
                        foreach (var collider in ragdoll.GetComponentsInChildren<Collider>())
                            Check((EnemyRagdoll.CombatMask & (1 << collider.gameObject.layer)) == 0, "시체가 사격/거리 판정에 포함됐습니다.");
                        Physics.SyncTransforms();
                        for (int step = 0; step < 400; step++)
                        {
                            physics.Simulate(.02f);
                            ragdoll.AdvancePose(.02f);
                            foreach (var body in bodies)
                            {
                                Vector3 p = body.position;
                                Check(!float.IsNaN(p.x + p.y + p.z) && !float.IsInfinity(p.x + p.y + p.z), "물리 위치가 유효하지 않습니다.");
                                Check(p.y > -2f * scale && p.magnitude < 40f * scale, "관통 또는 과도한 튕김이 발생했습니다.");
                            }
                        }
                        Check(hips.position.y < originalHipHeight - .2f * scale, "몸이 무너지지 않고 서 있습니다.");
                        foreach (var joint in joints)
                            Check(Vector3.Distance(joint.transform.TransformPoint(joint.anchor),
                                joint.connectedBody.transform.TransformPoint(joint.connectedAnchor)) < .16f * scale, "사망 후 관절이 분리됐습니다.");
                    }
                    finally { UnityEngine.Object.DestroyImmediate(owner); UnityEngine.Object.DestroyImmediate(ground); }
                }
                Debug.Log("[Sniper Ridge] 쓰러짐 물리 검사 통과: 정지·달리기·웅크리기·경사면, 적 크기 1.5/2배, 관절 연결, 소총 낙하, 사격 판정 분리. 실제 화면에서도 동작을 확인하세요.");
            }
            finally
            {
                UnityEngine.Random.state = savedRandom;
                SceneManager.UnloadSceneAsync(scene);
            }
        }
        static void Check(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("[쓰러짐 검사] " + message);
        }
    }
}
