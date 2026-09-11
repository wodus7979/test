using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad]
    public static class EnemyAnimationSetup
    {
        const string Folder = "Assets/EnemyModel";
        const string PrefabPath = "Assets/Resources/Enemies/SoldierModel.prefab";
        const string ControllerPath = Folder + "/Soldier.controller";
        static bool building;

        static EnemyAnimationSetup() { EditorApplication.delayCall += AutoBuild; }
        static void AutoBuild()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorApplication.delayCall += AutoBuild;
                return;
            }
            try { BuildIfNeeded(); }
            catch (Exception ex) { Debug.LogError("[Sniper Ridge] 적 애니메이션 설정 실패: " + ex.Message); }
        }

        public static void BuildIfNeeded()
        {
            if (building) return;
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            var rig = prefab != null ? prefab.GetComponent<EnemyAnimationRig>() : null;
            if (rig != null && rig.SetupVersion == EnemyAnimationRig.CurrentVersion &&
                prefab.GetComponent<Animator>()?.runtimeAnimatorController != null) return;
            Build();
        }

        [MenuItem("Sniper Ridge/적 애니메이션 다시 생성")]
        public static void Build()
        {
            if (building) return;
            building = true;
            try { BuildInternal(); }
            finally { building = false; }
        }

        static void BuildInternal()
        {
            var paths = AssetDatabase.FindAssets("t:Model", new[] { Folder })
                .Select(AssetDatabase.GUIDToAssetPath).OrderBy(p => p == Folder + "/Soldier.fbx" ? 0 : 1).ThenBy(p => p).ToArray();
            if (paths.Length == 0) throw new FileNotFoundException("Assets/EnemyModel에 병사 FBX가 없습니다.");
            foreach (string path in paths)
            {
                var importer = AssetImporter.GetAtPath(path) as ModelImporter;
                if (importer == null) continue;
                // The bundled FBX has a Mixamo skeleton and ordinary transform curves.
                // Explicit Generic import avoids None/Legacy defaults and preserves bones for IK/hitboxes.
                importer.importAnimation = true;
                importer.animationType = ModelImporterAnimationType.Generic;
                importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                importer.optimizeGameObjects = false;
                importer.SaveAndReimport();
                importer = (ModelImporter)AssetImporter.GetAtPath(path);
                var clips = importer.clipAnimations.Length > 0 ? importer.clipAnimations : importer.defaultClipAnimations;
                foreach (var clip in clips)
                {
                    string name = clip.name.ToLowerInvariant();
                    clip.loopTime = name.Contains("idle") || name.Contains("walk") || name.Contains("run") || name.Contains("crouch");
                    clip.loopPose = clip.loopTime;
                    clip.lockRootRotation = true;
                    clip.lockRootPositionXZ = true;
                    clip.lockRootHeightY = true;
                    clip.keepOriginalOrientation = true;
                    clip.keepOriginalPositionXZ = true;
                    clip.keepOriginalPositionY = true;
                }
                importer.clipAnimations = clips;
                importer.SaveAndReimport();
            }

            GameObject model = null;
            AnimationClip idle = null, walk = null, run = null;
            foreach (string path in paths)
            {
                var candidate = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (model == null && candidate != null && candidate.GetComponentInChildren<SkinnedMeshRenderer>() != null) model = candidate;
                foreach (var clip in AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>())
                {
                    string name = clip.name.ToLowerInvariant();
                    if (name.StartsWith("__preview__") || name.Contains("tpose") || name.Contains("t-pose")) continue;
                    if (idle == null && name.Contains("idle") && !name.Contains("crouch")) idle = clip;
                    if (walk == null && name.Contains("walk")) walk = clip;
                    if (run == null && name.Contains("run")) run = clip;
                }
            }
            if (model == null || idle == null || walk == null || run == null)
                throw new InvalidOperationException("스킨 병사 모델과 Idle / Walk / Run 클립이 모두 필요합니다.");
            foreach (var clip in new[] { idle, walk, run })
                if (clip.legacy || AnimationUtility.GetCurveBindings(clip).Length == 0)
                    throw new InvalidOperationException("재생 가능한 뼈 애니메이션이 없습니다: " + clip.name);

            // These files are generated outputs. Rebuild the controller so stale Idle/Run-only states disappear.
            if (AssetDatabase.LoadAssetAtPath<AnimatorController>(ControllerPath) != null) AssetDatabase.DeleteAsset(ControllerPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
            controller.AddParameter(new AnimatorControllerParameter { name = "MotionRate", type = AnimatorControllerParameterType.Float, defaultFloat = 1f });
            var tree = new BlendTree { name = "Locomotion", blendType = BlendTreeType.Simple1D,
                blendParameter = "Speed", useAutomaticThresholds = false };
            tree.AddChild(idle, 0f);
            tree.AddChild(walk, EnemyAnimationRig.WalkReferenceSpeed);
            tree.AddChild(run, EnemyAnimationRig.RunReferenceSpeed);
            AssetDatabase.AddObjectToAsset(tree, controller);
            var state = controller.layers[0].stateMachine.AddState("Locomotion");
            state.motion = tree;
            state.speedParameter = "MotionRate";
            state.speedParameterActive = true;
            controller.layers[0].stateMachine.defaultState = state;

            var material = AssetDatabase.LoadAssetAtPath<Material>(Folder + "/Soldier.mat");
            if (material == null)
            {
                material = new Material(Shader.Find("Standard"));
                AssetDatabase.CreateAsset(material, Folder + "/Soldier.mat");
            }
            var uniformShader = Resources.Load<Shader>("Shaders/EnemyUniform");
            if (uniformShader == null) throw new InvalidOperationException("EnemyUniform 셰이더가 누락됐습니다.");
            material.shader = uniformShader;
            material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(Folder + "/Soldier_albedo.png");
            material.SetFloat("_Glossiness", .25f);
            var normal = AssetDatabase.LoadAssetAtPath<Texture2D>(Folder + "/Soldier_normal.png");
            if (normal != null) { material.SetTexture("_BumpMap", normal); material.EnableKeyword("_NORMALMAP"); }
            EditorUtility.SetDirty(material);

            Directory.CreateDirectory("Assets/Resources/Enemies");
            AssetDatabase.Refresh();
            var instance = UnityEngine.Object.Instantiate(model);
            try
            {
                var animator = instance.GetComponent<Animator>() ?? instance.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;
                animator.enabled = true;
                if (animator.avatar == null)
                    animator.avatar = AssetDatabase.LoadAllAssetsAtPath(AssetDatabase.GetAssetPath(model)).OfType<Avatar>().FirstOrDefault();
                if (animator.avatar == null || !animator.avatar.isValid)
                    throw new InvalidOperationException("병사 Generic Avatar가 올바르게 생성되지 않았습니다.");
                animator.applyRootMotion = false;
                animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                animator.updateMode = AnimatorUpdateMode.Normal;
                var rig = instance.GetComponent<EnemyAnimationRig>() ?? instance.AddComponent<EnemyAnimationRig>();
                rig.SetupVersion = EnemyAnimationRig.CurrentVersion;
                foreach (var renderer in instance.GetComponentsInChildren<SkinnedMeshRenderer>())
                {
                    renderer.sharedMaterials = renderer.sharedMaterials.Select(_ => material).ToArray();
                    renderer.updateWhenOffscreen = true;
                }
                // Fail before saving a static-looking prefab if its transform animation paths do not bind.
                foreach (var clip in new[] { idle, walk, run })
                {
                    int bound = AnimationUtility.GetCurveBindings(clip).Count(binding =>
                        binding.type == typeof(Transform) && (string.IsNullOrEmpty(binding.path) || instance.transform.Find(binding.path) != null));
                    if (bound < 12) throw new InvalidOperationException("병사 뼈에 연결된 곡선이 부족합니다: " + clip.name);
                }
                if (!EnemyRagdoll.CanBuild(instance.transform))
                    throw new InvalidOperationException("사망 물리에 필요한 머리·몸통·팔다리 뼈가 누락됐습니다.");
                ValidateMotion(instance, walk);
                ValidateMotion(instance, run);
                ValidateLimbSolver();
                CoverAndAudioValidation.ValidateFootwork();
                idle.SampleAnimation(instance, 0f);
                PrefabUtility.SaveAsPrefabAsset(instance, PrefabPath);
            }
            finally { UnityEngine.Object.DestroyImmediate(instance); }
            AssetDatabase.SaveAssets();
            Debug.Log("[Sniper Ridge] 적 애니메이션 v5 생성 완료: 병과별 군복, 엄폐 발 디딤·일어서기·어깨 조준, 양손 총기 지지, 뼈 추적 히트박스.");
        }
        static void ValidateMotion(GameObject instance, AnimationClip clip)
        {
            var foot = instance.GetComponentsInChildren<Transform>().FirstOrDefault(t => t.name.Replace(":", "").ToLowerInvariant().EndsWith("leftfoot"));
            if (foot == null) throw new InvalidOperationException("왼발 뼈를 찾지 못했습니다.");
            clip.SampleAnimation(instance, 0f);
            Vector3 first = foot.position;
            float displacement = 0f;
            for (int i = 1; i <= 4; i++)
            {
                clip.SampleAnimation(instance, clip.length * i / 5f);
                displacement = Mathf.Max(displacement, Vector3.Distance(first, foot.position));
            }
            if (displacement < .005f) throw new InvalidOperationException("걷기/달리기 클립에서 발이 움직이지 않습니다: " + clip.name);
        }

        static void ValidateLimbSolver()
        {
            var upper = new GameObject("IK validation");
            var lower = new GameObject("Knee"); lower.transform.SetParent(upper.transform);
            var foot = new GameObject("Foot"); foot.transform.SetParent(lower.transform);
            try
            {
                foreach (var target in new[] { new Vector3(0, -.8f, .1f), new Vector3(.2f, -.4f, .4f), new Vector3(0, -2f, 0) })
                {
                    upper.transform.rotation = Quaternion.identity;
                    lower.transform.localRotation = Quaternion.identity;
                    lower.transform.localPosition = Vector3.down * .5f;
                    foot.transform.localPosition = Vector3.down * .5f;
                    EnemyAnimationRig.SolveLimb(upper.transform, lower.transform, foot.transform, target, Vector3.forward);
                    Vector3 expected = target.normalized * Mathf.Clamp(target.magnitude, .0001f, .999f);
                    if (Vector3.Distance(foot.transform.position, expected) > .001f ||
                        Mathf.Abs(Vector3.Distance(upper.transform.position, lower.transform.position) - .5f) > .001f ||
                        Mathf.Abs(Vector3.Distance(lower.transform.position, foot.transform.position) - .5f) > .001f)
                        throw new InvalidOperationException("다리 IK의 도달점/뼈 길이 검증 실패.");
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(upper); }
        }
    }

    public class EnemyAnimationBuildPreflight : IPreprocessBuildWithReport
    {
        public int callbackOrder => 10;
        public void OnPreprocessBuild(BuildReport report) => EnemyAnimationSetup.BuildIfNeeded();
    }
}
