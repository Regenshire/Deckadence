"""Application storage adapter for the plugin-owned prompt dictionary."""
from pathlib import Path
from paths import PLUGIN_ROOT_DIR
from .studio_prompter import dictionary, contracts

DEFAULT_PATH = dictionary.DEFAULT_PATH
PromptDictionaryError = contracts.PlannerError
TOKENS = dictionary.TOKENS

def defaults(): return dictionary.defaults()
def settings_path(root=None): return Path(root or Path(PLUGIN_ROOT_DIR, 'card-finishing-generation')) / 'ai_prompt_dictionary.json'
def validate(value): return dictionary.validate(value)
def load(root=None): return dictionary.load(settings_path(root))
def save(value, root=None): return dictionary.save(value, settings_path(root))

def render(parts,key,**context):
    values=dict.fromkeys(TOKENS,'');values.update(context)
    return parts[key].format_map(values).strip()

def resolve(model,feature,user_prompt='',theme='custom',maintain_style=True,root=None):
    dictionary=load(root)
    if model not in dictionary['models']:raise PromptDictionaryError('Choose a supported prompt model.')
    parts=dictionary['models'][model]
    style=render(parts,'style',user_prompt=user_prompt) if maintain_style else ''
    direction=user_prompt if theme=='custom' else render(parts,'theme_'+theme,user_prompt=user_prompt,style=style)
    context=dict(user_prompt=user_prompt,style=style,theme_direction=direction,theme_style=render(parts,'theme_style_'+theme,user_prompt=user_prompt,style=style))
    if feature=='mirror':key='mirror_scene';negative='mirror_negative'
    else:raise PromptDictionaryError('This AI operation does not use generative prompts.')
    return dict(prompt=render(parts,key,**context),negative_prompt=render(parts,negative,**context),
                outpaint_prompt=render(parts,'mirror_outpaint',**context),
                background_prompt=render(parts,'mirror_background',**context),
                background_negative=render(parts,'mirror_background_negative',**context),prompt_parts=parts)
