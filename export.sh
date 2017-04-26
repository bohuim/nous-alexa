#!/bin/bash

[ -e skill.zip ] && rm skill.zip
zip -rq skill.zip . -x .\* \*.zip \*.sh \*sublime\* skill/\*
