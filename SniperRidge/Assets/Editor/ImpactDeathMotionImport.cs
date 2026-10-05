using System.Linq;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class ImpactDeathMotionImport
    {
        public static void Run()
        {
            EnemyMeleeDeathImport.Retarget("Assets/MutantCharacter/Source/Getting Thrown.fbx","Assets/Resources/Enemies/PropKnockback.anim","Getting Thrown",true,true,true);
            var clip=AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/Resources/Enemies/PropKnockback.anim");
            // The collision-swept scene trajectory owns horizontal displacement.
            foreach(var binding in AnimationUtility.GetCurveBindings(clip).Where(b=>b.path.ToLowerInvariant().EndsWith("hips")&&(b.propertyName=="m_LocalPosition.x"||b.propertyName=="m_LocalPosition.z")))
            {
                float origin=AnimationUtility.GetEditorCurve(clip,binding).Evaluate(0);
                AnimationUtility.SetEditorCurve(clip,binding,AnimationCurve.Constant(0,clip.length,origin));
            }
            EnemyMeleeDeathImport.Retarget("Assets/MutantCharacter/Source/Falling Back Death.fbx","Assets/Resources/Enemies/PlayerDeath.anim","Falling Back Death",true,true,true);
            var set=Resources.Load<NativeMutantSet>(HulkVisual.Resource);set.Death=StreetMotionImport.Import("Mutant Dying");
            EditorUtility.SetDirty(set);EditorUtility.SetDirty(clip);AssetDatabase.SaveAssets();
            Debug.Log("[Impact death] Mixamo throw reaction, human death and mutant death imported.");
        }
    }
}
