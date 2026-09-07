using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    /// <summary>
    /// 프로젝트를 처음 열었을 때 게임 씬을 만들고 빌드 설정/안드로이드 플레이어 설정을 자동으로 잡아 준다.
    /// 메뉴: Sniper Ridge > ...
    /// </summary>
    [InitializeOnLoad]
    public static class SniperRidgeSetup
    {
        const string ScenePath = "Assets/Scenes/SniperRidge.unity";
        const string ProductName = "Sniper Ridge";

        static SniperRidgeSetup()
        {
            EditorApplication.delayCall += AutoSetup;
        }

        static void AutoSetup()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            EnsureScene(false);
            EnsurePlayerSettings();
            EnsureAlwaysIncludedShaders();
        }

        [MenuItem("Sniper Ridge/게임 씬 열기")]
        public static void OpenGameScene()
        {
            EnsureScene(true);
        }

        [MenuItem("Sniper Ridge/Android APK 빌드")]
        public static void BuildAndroid()
        {
            EnsureScene(false);
            EnsurePlayerSettings();
            EnsureAlwaysIncludedShaders();
            Directory.CreateDirectory("Builds");
            EditorUserBuildSettings.buildAppBundle = false;
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/SniperRidge.apk",
                target = BuildTarget.Android,
                options = BuildOptions.None,
            };
            Report(BuildPipeline.BuildPlayer(options), "Builds/SniperRidge.apk");
        }

        [MenuItem("Sniper Ridge/Windows 빌드")]
        public static void BuildWindows()
        {
            EnsureScene(false);
            EnsurePlayerSettings();
            EnsureAlwaysIncludedShaders();
            Directory.CreateDirectory("Builds/Windows");
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/Windows/SniperRidge.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None,
            };
            Report(BuildPipeline.BuildPlayer(options), "Builds/Windows/SniperRidge.exe");
        }

        // ---------- 적 모델 자동 설정 ----------

        const string ModelFolder = "Assets/EnemyModel";
        const string ModelPrefabPath = "Assets/Resources/Enemies/SoldierModel.prefab";

        /// <summary>
        /// Assets/EnemyModel 폴더에 넣어 둔 FBX(모델 1개 + 애니메이션 FBX들)로
        /// Animator Controller 와 프리팹을 만들어 Resources/Enemies/SoldierModel 로 저장한다.
        /// 애니메이션 클립 이름에 idle / run 또는 walk / crouch / death 또는 dying 이 들어 있으면 자동 연결된다.
        /// </summary>
        [MenuItem("Sniper Ridge/적 모델 자동 설정 (Assets/EnemyModel)")]
        public static void SetupEnemyModel()
        {
            if (!AssetDatabase.IsValidFolder(ModelFolder))
            {
                EditorUtility.DisplayDialog("Sniper Ridge", ModelFolder + " 폴더가 없습니다.\n병사 모델 FBX 와 애니메이션 FBX 를 그 폴더에 넣은 뒤 다시 실행하세요.", "확인");
                return;
            }

            GameObject modelAsset = null;
            AnimationClip idle = null, run = null, crouch = null, death = null;
            foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { ModelFolder }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = AssetImporter.GetAtPath(path) as ModelImporter;
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (go == null) continue;

                bool hasSkin = go.GetComponentInChildren<SkinnedMeshRenderer>() != null;
                if (hasSkin && modelAsset == null) modelAsset = go;

                bool changed = false;
                foreach (var obj in AssetDatabase.LoadAllAssetRepresentationsAtPath(path))
                {
                    var clip = obj as AnimationClip;
                    if (clip == null || clip.name.StartsWith("__preview__")) continue;
                    string n = clip.name.ToLowerInvariant() + " " + System.IO.Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                    bool loop = false;
                    if (idle == null && n.Contains("idle") && !n.Contains("crouch")) { idle = clip; loop = true; }
                    else if (run == null && (n.Contains("run") || n.Contains("walk"))) { run = clip; loop = true; }
                    else if (crouch == null && n.Contains("crouch")) { crouch = clip; loop = true; }
                    else if (death == null && (n.Contains("death") || n.Contains("dying") || n.Contains("die"))) { death = clip; }
                    if (loop && importer != null)
                    {
                        var clips = importer.clipAnimations.Length > 0 ? importer.clipAnimations : importer.defaultClipAnimations;
                        for (int i = 0; i < clips.Length; i++)
                        {
                            if (clips[i].name == clip.name && !clips[i].loopTime) { clips[i].loopTime = true; changed = true; }
                        }
                        if (changed) importer.clipAnimations = clips;
                    }
                }
                if (changed && importer != null) importer.SaveAndReimport();
            }

            if (modelAsset == null)
            {
                EditorUtility.DisplayDialog("Sniper Ridge", "스킨 메시가 있는 모델 FBX 를 " + ModelFolder + " 에서 찾지 못했습니다.", "확인");
                return;
            }

            // Animator Controller
            string controllerPath = ModelFolder + "/Soldier.controller";
            var controller = UnityEditor.Animations.AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
            controller.AddParameter("Crouch", AnimatorControllerParameterType.Bool);
            controller.AddParameter("Dead", AnimatorControllerParameterType.Bool);
            var sm = controller.layers[0].stateMachine;
            var idleState = sm.AddState("Idle");
            idleState.motion = idle;
            sm.defaultState = idleState;
            if (run != null)
            {
                var runState = sm.AddState("Run");
                runState.motion = run;
                var toRun = idleState.AddTransition(runState);
                toRun.hasExitTime = false; toRun.duration = 0.15f;
                toRun.AddCondition(UnityEditor.Animations.AnimatorConditionMode.Greater, 0.2f, "Speed");
                var toIdle = runState.AddTransition(idleState);
                toIdle.hasExitTime = false; toIdle.duration = 0.15f;
                toIdle.AddCondition(UnityEditor.Animations.AnimatorConditionMode.Less, 0.2f, "Speed");
            }
            if (crouch != null)
            {
                var crouchState = sm.AddState("Crouch");
                crouchState.motion = crouch;
                var toCrouch = idleState.AddTransition(crouchState);
                toCrouch.hasExitTime = false; toCrouch.duration = 0.2f;
                toCrouch.AddCondition(UnityEditor.Animations.AnimatorConditionMode.If, 0f, "Crouch");
                var back = crouchState.AddTransition(idleState);
                back.hasExitTime = false; back.duration = 0.2f;
                back.AddCondition(UnityEditor.Animations.AnimatorConditionMode.IfNot, 0f, "Crouch");
            }
            if (death != null)
            {
                var deathState = sm.AddState("Death");
                deathState.motion = death;
                var any = sm.AddAnyStateTransition(deathState);
                any.hasExitTime = false; any.duration = 0.1f; any.canTransitionToSelf = false;
                any.AddCondition(UnityEditor.Animations.AnimatorConditionMode.If, 0f, "Dead");
            }

            // 프리팹
            System.IO.Directory.CreateDirectory("Assets/Resources/Enemies");
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(modelAsset);
            var anim = inst.GetComponent<Animator>();
            if (anim == null) anim = inst.AddComponent<Animator>();
            anim.runtimeAnimatorController = controller;
            anim.applyRootMotion = false;
            anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
            PrefabUtility.SaveAsPrefabAsset(inst, ModelPrefabPath);
            Object.DestroyImmediate(inst);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            string report = string.Format("프리팹 생성: {0}\nIdle: {1}\nRun: {2}\nCrouch: {3}\nDeath: {4}\n\n이제 Play 를 누르면 이 모델이 적으로 사용됩니다.",
                ModelPrefabPath, idle ? idle.name : "(없음)", run ? run.name : "(없음)", crouch ? crouch.name : "(없음)", death ? death.name : "(없음)");
            Debug.Log("[Sniper Ridge] " + report.Replace("\n", " / "));
            EditorUtility.DisplayDialog("Sniper Ridge", report, "확인");
        }

        static void Report(BuildReport report, string path)
        {
            if (report.summary.result == BuildResult.Succeeded)
                Debug.Log("[Sniper Ridge] 빌드 성공: " + path);
            else
                Debug.LogError("[Sniper Ridge] 빌드 실패: " + report.summary.result);
        }

        static void EnsureScene(bool forceOpen)
        {
            bool created = false;
            if (!File.Exists(ScenePath))
            {
                var active = SceneManager.GetActiveScene();
                if (active.isDirty && !forceOpen) return;

                Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
                AssetDatabase.Refresh();
                created = true;
                Debug.Log("[Sniper Ridge] 게임 씬을 생성했습니다: " + ScenePath + "  (Play 버튼을 누르면 레벨이 자동 생성됩니다)");
            }

            if (!EditorBuildSettings.scenes.Any(s => s.path == ScenePath))
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

            var current = SceneManager.GetActiveScene();
            bool untitled = string.IsNullOrEmpty(current.path);
            if (current.path == ScenePath) return;
            if (forceOpen || created || (untitled && !current.isDirty))
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }

        static void EnsurePlayerSettings()
        {
            if (PlayerSettings.productName == ProductName) return;
            try
            {
                PlayerSettings.companyName = "SniperRidge";
                PlayerSettings.productName = ProductName;
                PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
                PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.sniperridge.game");
                PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
                PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
                PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
                AssetDatabase.SaveAssets();
                Debug.Log("[Sniper Ridge] 안드로이드 플레이어 설정을 적용했습니다 (가로 모드, IL2CPP, ARM64, API 24+).");
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning("[Sniper Ridge] 플레이어 설정 적용 중 문제: " + ex.Message);
            }
        }

        /// <summary>
        /// 런타임에 코드로 만드는 머티리얼/지형이 빌드에서 분홍색이 되지 않도록
        /// 필요한 셰이더를 Graphics Settings 의 Always Included Shaders 에 등록한다.
        /// </summary>
        static void EnsureAlwaysIncludedShaders()
        {
            string[] names =
            {
                "Standard", "Unlit/Color", "Sprites/Default", "UI/Default",
                "Nature/Terrain/Standard", "Legacy Shaders/Diffuse",
                "Hidden/TerrainEngine/Details/BillboardWavingDoublePass",
                "Hidden/TerrainEngine/Details/WavingDoublePass",
            };
            try
            {
                var settings = new SerializedObject(UnityEngine.Rendering.GraphicsSettings.GetGraphicsSettings());
                var list = settings.FindProperty("m_AlwaysIncludedShaders");
                if (list == null) return;
                bool changed = false;
                foreach (var name in names)
                {
                    var shader = Shader.Find(name);
                    if (shader == null) continue;
                    bool exists = false;
                    for (int i = 0; i < list.arraySize; i++)
                    {
                        if (list.GetArrayElementAtIndex(i).objectReferenceValue == shader) { exists = true; break; }
                    }
                    if (exists) continue;
                    list.arraySize++;
                    list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = shader;
                    changed = true;
                }
                if (changed)
                {
                    settings.ApplyModifiedProperties();
                    AssetDatabase.SaveAssets();
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning("[Sniper Ridge] Always Included Shaders 설정 중 문제: " + ex.Message);
            }
        }
    }
}
