#Have TheLiterature.xpi be the default build target
all: TheLiterature.xpi

#Get the current version number from install.rdf
RELEASE=$(shell grep 'em:version' install.rdf | \
	sed -e s/'<em:version>'// -e s/'<\/em:version>'// -e s/^\ *//)

#Build the version. The FORCE command has the script rebuild the target.
#Since it has no prerequisites, TheLiterature-$(RELEASE).xpi would always be
#considered up to date and its recipe would not be executed.
#https://www.gnu.org/software/make/manual/html_node/Phony-Targets.html
TheLiterature-$(RELEASE).xpi: FORCE
	rm -rf builds/$@
	zip -r builds/$@ chrome chrome.manifest defaults install.rdf -x \*.DS_Store

#Assume we're building the latest version, so copy it into an unverstioned
#release
TheLiterature.xpi: TheLiterature-$(RELEASE).xpi
	cp builds/$< builds/$@

FORCE:
